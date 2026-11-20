// GET /api/stock/recipes/coverage — which products have/lack recipes — recipe.manage.
import { ok, withAuth } from '@/lib/api'
import { recipeCoverage } from '@/lib/stock'

export const GET = withAuth(
  async () => {
    const coverage = await recipeCoverage()
    return ok({ products: coverage })
  },
  { grants: ['recipe.manage'] }
)
