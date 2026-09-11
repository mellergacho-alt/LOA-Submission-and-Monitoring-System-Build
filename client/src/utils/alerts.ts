import Swal from "sweetalert2";

// Shared SweetAlert2 wrappers for CRUD feedback across the app, styled to
// match theme.css's tokens/fonts rather than SweetAlert's default look.
// Use these instead of window.confirm()/window.alert() and instead of a
// one-off inline "Saved!" state for a Create/Update/Delete action.

const swalBase = Swal.mixin({
  customClass: {
    popup: "swal-popup",
    title: "swal-title",
    confirmButton: "btn btn--primary",
    cancelButton: "btn btn--ghost",
  },
  buttonsStyling: false,
});

// Confirms a destructive action (delete). Resolves true only if confirmed.
export async function confirmDelete(title: string, text?: string, confirmButtonText = "Delete"): Promise<boolean> {
  const result = await swalBase.fire({
    icon: "warning",
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: "Cancel",
    reverseButtons: true,
    focusCancel: true,
    customClass: {
      popup: "swal-popup",
      title: "swal-title",
      confirmButton: "btn btn--primary swal-confirm--danger",
      cancelButton: "btn btn--ghost",
    },
  });
  return result.isConfirmed;
}

const toastBase = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 2800,
  timerProgressBar: true,
  customClass: { popup: "swal-toast" },
  didOpen: (toastEl) => {
    toastEl.addEventListener("mouseenter", Swal.stopTimer);
    toastEl.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

export function showSuccess(message: string) {
  toastBase.fire({ icon: "success", title: message });
}

export function showError(message: string) {
  toastBase.fire({ icon: "error", title: message, timer: 4000 });
}
