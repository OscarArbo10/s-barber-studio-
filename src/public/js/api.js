/**
 * S BARBER STUDIO — API Client & UI Feedback Utilities (Light Theme)
 */

const KultAPI = {
  async request(path, options = {}) {
    const headers = {
      'Accept': 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    };

    const token = localStorage.getItem('kult_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin'
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Error ${res.status} en la solicitud.`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  },

  get(path) {
    return this.request(path, { method: 'GET' });
  },

  post(path) {
    const body = arguments[1];
    return this.request(path, { method: 'POST', body: JSON.stringify(body) });
  },

  put(path, body) {
    return this.request(path, { method: 'PUT', body: JSON.stringify(body) });
  },

  delete(path) {
    return this.request(path, { method: 'DELETE' });
  },

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.readAsDataURL(file);
    });
  }
};

const KultUI = {
  toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const el = document.createElement('div');
    const isError = type === 'error';
    const borderColor = isError ? 'border-red-500' : 'border-zinc-300';
    const pipColor = isError ? 'bg-red-600' : 'bg-[#059669]';

    el.className = `surface-level-3 border ${borderColor} rounded-lg px-4 py-3 flex items-center gap-3 text-sm text-zinc-900 shadow-xl transform transition-all duration-150 translate-y-0 opacity-100 max-w-md`;
    el.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full shrink-0 ${pipColor}"></span>
      <span class="font-body-sm flex-1 font-medium">${this.escapeHtml(message)}</span>
      <button type="button" class="text-zinc-500 hover:text-zinc-900 transition-colors" onclick="this.parentElement.remove()">
        <span class="material-symbols-outlined text-[16px]">close</span>
      </button>
    `;
    container.appendChild(el);

    setTimeout(() => {
      if (el.parentElement) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => el.remove(), 150);
      }
    }, 4200);
  },

  confirmDialog({ title, message, confirmText = 'Confirmar', destructive = false }) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-dialog-modal');
      if (!modal) {
        resolve(true);
        return;
      }
      document.getElementById('confirm-dialog-title').textContent = title || 'Confirmar Acción';
      document.getElementById('confirm-dialog-message').textContent = message || '¿Deseas continuar con esta operación?';

      const confirmBtn = document.getElementById('confirm-dialog-ok');
      const cancelBtn = document.getElementById('confirm-dialog-cancel');

      confirmBtn.textContent = confirmText;
      if (destructive) {
        confirmBtn.className = 'px-4 py-2.5 rounded bg-red-600 text-white font-label-md text-label-md uppercase tracking-wider hover:bg-red-700 transition-all';
      } else {
        confirmBtn.className = 'btn-kult-primary py-2.5 px-4';
      }

      modal.classList.remove('hidden');
      modal.classList.add('flex');

      const cleanup = (result) => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve(result);
      };

      confirmBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
    });
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatPrice(amount, symbol = '$') {
    const num = Number(amount) || 0;
    return `${symbol}${num % 1 === 0 ? num.toFixed(0) : num.toFixed(2)}`;
  }
};

window.KultAPI = KultAPI;
window.KultUI = KultUI;
