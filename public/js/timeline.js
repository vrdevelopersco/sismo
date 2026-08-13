// public/js/timeline.js
// Controlador de reproducción histórica / Time scrubber

export class SeismicTimelineController {
  constructor(onFilterByTimeRange) {
    this.onFilterByTimeRange = onFilterByTimeRange;
    this.isPlaying = false;
    this.playbackTimer = null;
    this.currentStep = 24; // Horas
  }

  setHours(hours) {
    this.currentStep = Number(hours);
    if (this.onFilterByTimeRange) {
      this.onFilterByTimeRange(this.currentStep);
    }
  }
}
