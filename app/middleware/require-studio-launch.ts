import { hasStudioLaunchAccess } from '~/utils/studio-launch'

export default defineNuxtRouteMiddleware(() => {
  if (hasStudioLaunchAccess()) {
    return
  }

  return navigateTo('/')
})
