import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CompareTable } from './CompareTable'

const rows = [
  { id: 'a', name: 'Plan A', cost: '10' },
  { id: 'b', name: 'Plan B', cost: '20' },
]
const columns = [{ key: 'cost', header: 'Cost', render: (r: (typeof rows)[number]) => r.cost }]

const renderTable = () =>
  render(
    <CompareTable
      caption="Plans"
      rows={rows}
      rowKey={(r) => r.id}
      title={(r) => r.name}
      badges={(r) => <span className="badge">{`Mark ${r.id}`}</span>}
      columns={columns}
    />,
  )

describe('CompareTable', () => {
  it('keeps "Option" as the first header unless titleHeader is given', () => {
    renderTable()
    expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent('Option')
  })

  it('renders a custom first header and a class per row', () => {
    render(
      <CompareTable
        caption="Plans"
        rows={rows}
        rowKey={(r) => r.id}
        title={(r) => r.name}
        columns={columns}
        titleHeader="Item"
        rowClassName={(r) => (r.id === 'a' ? 'is-flagged' : undefined)}
      />,
    )
    expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent('Item')
    expect(screen.getByRole('row', { name: /Plan A/ })).toHaveClass('is-flagged')
    expect(screen.getByRole('row', { name: /Plan B/ })).not.toHaveClass('is-flagged')
  })

  it('renders a captioned table with a header per column plus the title column', () => {
    renderTable()
    expect(screen.getByRole('table', { name: 'Plans' })).toHaveClass('compare-table')
    expect(screen.getAllByRole('columnheader')).toHaveLength(columns.length + 1)
    expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1)
  })

  it('shows the title and badges in the first cell of each row', () => {
    renderTable()
    const first = screen.getAllByRole('row')[1]
    const cell = within(first).getAllByRole('cell')[0]
    expect(within(cell).getByText('Plan A')).toBeInTheDocument()
    expect(within(cell).getByText('Mark a')).toBeInTheDocument()
  })

  it('labels every cell so phones can stack the rows as cards', () => {
    renderTable()
    screen.getAllByRole('cell').forEach((td) => expect(td).toHaveAttribute('data-label'))
  })
})
