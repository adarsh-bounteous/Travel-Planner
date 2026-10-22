# Trip Planner API

FastAPI service. Python 3.12.

    pip install -r requirements.txt
    uvicorn app.main:app --reload
    sh run-py.sh -m pytest -c pytest.ini        # unit
    sh run-py.sh -m pytest -c pytest-e2e.ini    # e2e
    sh build.sh
