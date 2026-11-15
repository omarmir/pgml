import { defineComponent } from 'vue'

export const createDiagramSceneStub = () => defineComponent({
  name: 'PgmlDiagramGpuScene',
  props: ['rendererBackend'],
  setup(_, { expose }) {
    expose({
      cancelInteraction: () => {},
      setConnectionDragPreview: () => {},
      setDragPreview: () => {},
      resetView: () => {},
      focusBounds: () => {},
      handleWheel: () => {},
      getScale: () => 1,
      zoomBy: () => {}
    })
    return {}
  },
  template: '<div data-renderer-test :data-backend="rendererBackend" />'
})
