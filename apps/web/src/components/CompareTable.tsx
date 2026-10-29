import type { ReactNode } from 'react'

type CompareColumn<T> = { key: string; header: string; render: (row: T) => ReactNode }

type CompareTableProps<T> = {
  caption: string
  rows: T[]
  rowKey: (row: T) => string
  /** First column; also the heading of the stacked card on phones. */
  title: (row: T) => ReactNode
  /** Shown under the title in both modes. */
  badges?: (row: T) => ReactNode
  columns: CompareColumn<T>[]
}

/** Options side by side: a table on desktop, one stacked option card per row on phones. */
export function CompareTable<T>({ caption, rows, rowKey, title, badges, columns }: CompareTableProps<T>) {
  return (
    <table className="compare-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Option</th>
          {columns.map((c) => (
            <th scope="col" key={c.key}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            <td data-label="Option" className="compare-table-title">
              <strong>{title(row)}</strong>
              {badges && <div className="badges">{badges(row)}</div>}
            </td>
            {columns.map((c) => (
              <td key={c.key} data-label={c.header}>
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
