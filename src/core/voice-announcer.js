/**
 * Voice Announcer — Turn-by-turn voice navigation using Web Speech API
 * Feature 7: Announces turns at 200m, 100m, and at the turn point.
 */

import { maneuverLabel } from './bearing-engine.js';
import { formatDistance } from '../utils/helpers.js';

export class VoiceAnnouncer {
  constructor() {
    this.enabled = true;
    this.synth = window.speechSynthesis || null;
    this.lastAnnouncedIndex = -1;
    this.lastAnnouncedThreshold = null; // 'far' | 'near' | 'at'
    this.voice = null;

    // Try to pick an English voice
    if (this.synth) {
      const loadVoices = () => {
        const voices = this.synth.getVoices();
        this.voice = voices.find(v => v.lang.startsWith('en') && v.localService) 
                  || voices.find(v => v.lang.startsWith('en'))
                  || voices[0] || null;
      };
      loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = loadVoices;
      }
    }
  }

  /**
   * Check if voice synthesis is available
   */
  get isAvailable() {
    return !!this.synth;
  }

  /**
   * Toggle voice on/off
   */
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled && this.synth) {
      this.synth.cancel();
    }
    return this.enabled;
  }

  setEnabled(val) {
    this.enabled = val;
    if (!val && this.synth) {
      this.synth.cancel();
    }
  }

  /**
   * Announce a turn instruction based on distance thresholds
   * @param {object} instruction - Turn instruction object { maneuver, label, distanceToNext }
   * @param {number} distanceToTurn - Current distance to the turn point in meters
   * @param {number} instructionIndex - Current instruction index
   */
  announce(instruction, distanceToTurn, instructionIndex) {
    if (!this.enabled || !this.synth || !instruction) return;

    let threshold = null;

    if (distanceToTurn <= 30) {
      threshold = 'at';
    } else if (distanceToTurn <= 100) {
      threshold = 'near';
    } else if (distanceToTurn <= 200) {
      threshold = 'far';
    }

    if (!threshold) return;

    // Don't re-announce same instruction at same threshold
    if (instructionIndex === this.lastAnnouncedIndex && threshold === this.lastAnnouncedThreshold) {
      return;
    }

    this.lastAnnouncedIndex = instructionIndex;
    this.lastAnnouncedThreshold = threshold;

    let text = '';
    const label = instruction.label || maneuverLabel(instruction.maneuver);

    switch (threshold) {
      case 'far':
        text = `In ${formatDistance(distanceToTurn)}, ${label}.`;
        break;
      case 'near':
        text = `${label} ahead.`;
        break;
      case 'at':
        text = `${label} now.`;
        break;
    }

    this.speak(text);
  }

  /**
   * Announce arrival
   */
  announceArrival() {
    if (!this.enabled) return;
    this.speak('You have arrived at your destination.');
  }

  /**
   * Announce rerouting
   */
  announceReroute() {
    if (!this.enabled) return;
    this.speak('Recalculating route.');
  }

  /**
   * Speak a text string
   */
  speak(text) {
    if (!this.synth || !text) return;

    // Cancel any pending speech
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    if (this.voice) {
      utterance.voice = this.voice;
    }

    this.synth.speak(utterance);
  }

  /**
   * Reset tracking state (call when starting new navigation)
   */
  reset() {
    this.lastAnnouncedIndex = -1;
    this.lastAnnouncedThreshold = null;
    if (this.synth) {
      this.synth.cancel();
    }
  }
}
