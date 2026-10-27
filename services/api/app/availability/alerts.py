from typing import Literal, Protocol

from app.availability.gate import AvailabilityReport

AlertKind = Literal["availability_breach", "downtime_budget_exhausted"]

_SUBJECTS: dict[AlertKind, str] = {
    "availability_breach": "Availability breach",
    "downtime_budget_exhausted": "Downtime budget exhausted",
}


class AlertSink(Protocol):
    def raise_alert(self, kind: AlertKind, report: AvailabilityReport) -> None: ...


class SnsAlertSink:
    """Pages the on-call team through the SNS topic they subscribe to."""

    def __init__(self, topic_arn: str) -> None:
        import boto3

        self._topic_arn = topic_arn
        self._sns = boto3.client("sns")

    def raise_alert(self, kind: AlertKind, report: AvailabilityReport) -> None:
        minutes = report.downtime.total_seconds() / 60
        self._sns.publish(
            TopicArn=self._topic_arn,
            Subject=f"{_SUBJECTS[kind]} for {report.month}",
            Message=(
                f"{_SUBJECTS[kind]}: {report.month} availability {report.availability_percent:.3f}% "
                f"with {minutes:.1f} minutes of downtime (budget 43 minutes)."
            ),
        )
