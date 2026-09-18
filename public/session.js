// Loaded only by the authenticated production workspace.
(() => {
  const slot = document.querySelector(".side-bottom");
  if (!slot) return;
  const form = document.createElement("form");
  form.method = "post";
  form.action = "/auth/otp/logout";
  form.className = "session-logout";
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "تسجيل الخروج";
  form.append(button);
  slot.append(form);
})();
