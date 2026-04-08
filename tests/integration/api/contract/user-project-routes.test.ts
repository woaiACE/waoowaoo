import { describe, expect, it } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'

describe('api contract - user project routes (catalog)', () => {
  it('contains character relations route in user-project-routes group', () => {
    const userProjectRoutes = ROUTE_CATALOG
      .filter((entry) => entry.contractGroup === 'user-project-routes')
      .map((entry) => entry.routeFile)

    expect(userProjectRoutes).toContain('src/app/api/projects/[projectId]/character-relations/route.ts')
  })
})
