// Общие UI-хелперы: inline-ошибки валидации полей и состояния занятости кнопок.
// Используются на гостевой странице (app.js) и в админке (admin.js).

// Показывает сообщение об ошибке под полем ввода и помечает поле как невалидное.
export function setFieldError(input, message) {
  input.classList.add('invalid');
  input.setAttribute('aria-invalid', 'true');
  let error = input.parentElement.querySelector('.field-error');
  if (!error) {
    error = document.createElement('p');
    error.className = 'field-error';
    error.setAttribute('role', 'alert');
    input.parentElement.append(error);
  }
  error.textContent = message;
}

// Убирает inline-ошибки и пометки невалидности у всех полей формы.
export function clearFieldErrors(form) {
  for (const input of form.querySelectorAll('input')) {
    input.classList.remove('invalid');
    input.removeAttribute('aria-invalid');
    const error = input.parentElement.querySelector('.field-error');
    if (error) error.remove();
  }
}

// Переключает кнопку в состояние «занято» (disabled + смена подписи).
export function setBusy(button, busy, busyLabel, idleLabel) {
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = busyLabel;
    button.setAttribute('aria-busy', 'true');
  } else {
    button.disabled = false;
    button.textContent = idleLabel ?? button.dataset.originalText ?? '';
    button.removeAttribute('aria-busy');
  }
}
