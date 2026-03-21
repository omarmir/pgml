import { useStudioSessionStore } from '~/stores/studio-session'

export default defineNuxtRouteMiddleware(() => {
  const studioSessionStore = useStudioSessionStore()

  if (studioSessionStore.hasLaunchAccess()) {
    return
  }

  return navigateTo('/')
})
