const validators = {
  validateBookingInput(data) {
    const errors = [];
    if (!data || typeof data !== 'object') {
      return ['Datos de reserva inválidos.'];
    }
    if (!data.service_id || isNaN(Number(data.service_id))) {
      errors.push('Debes seleccionar un servicio válido.');
    }
    if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      errors.push('Debes seleccionar una fecha válida (YYYY-MM-DD).');
    }
    if (!data.start_time || !/^\d{2}:\d{2}$/.test(data.start_time)) {
      errors.push('Debes seleccionar un horario válido (HH:MM).');
    }
    if (!data.client_name || typeof data.client_name !== 'string' || data.client_name.trim().length < 2) {
      errors.push('Ingresa tu nombre completo (mínimo 2 caracteres).');
    }
    if (!data.client_phone || typeof data.client_phone !== 'string' || data.client_phone.replace(/[^0-9]/g, '').length < 7) {
      errors.push('Ingresa un número de teléfono válido (mínimo 7 dígitos).');
    }
    if (data.client_email && typeof data.client_email === 'string' && data.client_email.trim().length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.client_email.trim())) {
        errors.push('El formato del correo electrónico no es válido.');
      }
    }
    return errors;
  },

  validateServiceInput(data) {
    const errors = [];
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
      errors.push('El nombre del servicio es obligatorio.');
    }
    if (!data.category_id || isNaN(Number(data.category_id))) {
      errors.push('La categoría del servicio es obligatoria.');
    }
    if (data.price === undefined || isNaN(Number(data.price)) || Number(data.price) < 0) {
      errors.push('El precio debe ser un número mayor o igual a 0.');
    }
    if (!data.duration_minutes || isNaN(Number(data.duration_minutes)) || Number(data.duration_minutes) < 10) {
      errors.push('La duración debe ser de al menos 10 minutos.');
    }
    if (!data.description || typeof data.description !== 'string' || data.description.trim().length < 5) {
      errors.push('La descripción del servicio es obligatoria.');
    }
    return errors;
  },

  validateBarberInput(data) {
    const errors = [];
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
      errors.push('El nombre del barbero es obligatorio.');
    }
    if (!data.specialty || typeof data.specialty !== 'string' || data.specialty.trim().length < 2) {
      errors.push('La especialidad del barbero es obligatoria.');
    }
    return errors;
  },

  validateBlockInput(data) {
    const errors = [];
    if (!data.title || typeof data.title !== 'string' || data.title.trim().length < 2) {
      errors.push('El motivo o título del bloqueo es obligatorio.');
    }
    if (!data.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(data.start_date)) {
      errors.push('La fecha de inicio es obligatoria.');
    }
    if (data.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.end_date)) {
      errors.push('La fecha de fin es inválida.');
    }
    if (data.start_date && data.end_date && data.end_date < data.start_date) {
      errors.push('La fecha de fin no puede ser anterior a la fecha de inicio.');
    }
    return errors;
  }
};

module.exports = validators;
