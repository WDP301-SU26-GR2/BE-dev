export const AiMessages = {
  response: {
    segmentQueued: 'Segmentation job queued',
    applied: 'AI regions applied to page'
  },
  error: {
    aiNotEnabled: 'Error.AiNotEnabled',
    aiEnqueueFailed: 'Error.AiEnqueueFailed',
    pageHasNoFile: 'Error.PageHasNoFile',
    segmentJobAlreadyRunning: 'Error.SegmentJobAlreadyRunning',
    aiJobNotFound: 'Error.AiJobNotFound',
    aiJobNotApplicable: 'Error.AiJobNotApplicable'
  }
} as const
