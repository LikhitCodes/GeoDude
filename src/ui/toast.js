/**
 * Toast Notifications
 */

export class ToastManager {
  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  show(title, message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
    } else if (type === 'error') {
      iconSvg = '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
    } else if (type === 'warning') {
      iconSvg = '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>';
    } else {
      iconSvg = '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
    }

    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24">${iconSvg}</svg>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <div class="toast-progress" style="width: 100%"></div>
    `;

    this.container.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    const progressBar = toast.querySelector('.toast-progress');

    let timeout;
    let animationFrame;
    const startTime = Date.now();

    const animateProgress = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1 - (elapsed / duration));
      progressBar.style.width = `${remaining * 100}%`;

      if (remaining > 0) {
        animationFrame = requestAnimationFrame(animateProgress);
      }
    };

    const remove = () => {
      clearTimeout(timeout);
      cancelAnimationFrame(animationFrame);
      toast.classList.add('toast-exit');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300); // match fadeOut animation duration
    };

    closeBtn.addEventListener('click', remove);
    
    animationFrame = requestAnimationFrame(animateProgress);
    timeout = setTimeout(remove, duration);
  }

  success(title, message, duration) { this.show(title, message, 'success', duration); }
  error(title, message, duration) { this.show(title, message, 'error', duration); }
  warning(title, message, duration) { this.show(title, message, 'warning', duration); }
  info(title, message, duration) { this.show(title, message, 'info', duration); }
}

// Global instance
export const toast = new ToastManager();
