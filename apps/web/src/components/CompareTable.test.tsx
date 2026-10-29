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
