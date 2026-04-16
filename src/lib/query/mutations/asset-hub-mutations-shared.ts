import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { invalidateQueryTemplates } from './mutation-shared'

export const GLOBAL_ASSET_PROJECT_ID = 'global-asset-hub'

export function invalidateGlobalCharacters(queryClient: QueryClient) {
  return invalidateQueryTemplates(queryClient, [queryKeys.globalAssets.characters(), queryKeys.assets.all('global')])
}

export function invalidateGlobalLocations(queryClient: QueryClient) {
  return invalidateQueryTemplates(queryClient, [queryKeys.globalAssets.locations(), queryKeys.assets.all('global')])
}

export function invalidateGlobalVoices(queryClient: QueryClient) {
  return invalidateQueryTemplates(queryClient, [queryKeys.globalAssets.voices(), queryKeys.assets.all('global')])
}
