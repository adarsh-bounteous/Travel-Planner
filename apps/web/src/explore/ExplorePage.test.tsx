import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ExplorePage } from './ExplorePage'

describe('ExplorePage', () => {
  it('shows the heading and the destination search', async () => {
    render(
      <MemoryRouter>
        <ExplorePage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Explore' })).toBeInTheDocument()
    expect(screen.getByRole('search')).toBeInTheDocument()
  })

  it('goes to destination results when searching', async () => {
    render(
      <MemoryRouter initialEntries={['/explore']}>
        <Routes>
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/destinations" element={<p>Results</p>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('Search a city or place'), {
      target: { value: 'Lisbon' },
    })
    fireEvent.submit(screen.getByRole('search'))
    expect(await screen.findByText('Results')).toBeInTheDocument()
  })
})
