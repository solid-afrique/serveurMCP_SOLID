// Interactions de l'interface (sans dépendance ni compilation).
document.addEventListener("DOMContentLoaded", () => {
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content;

  // Boutons « Copier » : data-copy="texte".
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      const label = button.textContent;
      button.textContent = "Copié ✓";
      setTimeout(() => (button.textContent = label), 1500);
    });
  });

  // Confirmation avant une action : <form data-confirm="Message">.
  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      if (!confirm(form.dataset.confirm)) event.preventDefault();
    });
  });

  // Onglets : conteneur [data-tabs], boutons [data-tab="x"], panneaux [data-panel="x"].
  document.querySelectorAll("[data-tabs]").forEach((group) => {
    const buttons = group.querySelectorAll("[data-tab]");
    const panels = group.querySelectorAll("[data-panel]");
    const show = (name) => {
      buttons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
      panels.forEach((p) => (p.hidden = p.dataset.panel !== name));
      group.dispatchEvent(new CustomEvent("tabchange", { detail: name }));
    };
    buttons.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
  });

  // Formulaire de connexion : type de base, mode (champs / chaîne) et test.
  const form = document.querySelector("form[data-connection-form]");
  if (!form) return;
  const ports = { mysql: 3306, sqlsrv: 1433, pgsql: 5432, mongodb: 27017, redis: 6379 };
  const examples = {
    mysql: "mysql://utilisateur:motdepasse@hote:3306/base",
    sqlsrv: "Server=hote,1433;Database=base;User Id=utilisateur;Password=motdepasse;Encrypt=false",
    pgsql: "postgresql://utilisateur:motdepasse@hote:5432/base?sslmode=require",
    mongodb: "mongodb+srv://utilisateur:motdepasse@cluster.mongodb.net/base",
    redis: "rediss://default:motdepasse@hote:6379",
  };
  const typeInput = form.querySelector('input[name="type"]');
  const modeInput = form.querySelector('input[name="mode"]');

  const applyType = () => {
    const type = typeInput.value;
    form.querySelectorAll(".type").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
    form.querySelector('input[name="port"]').placeholder = ports[type];
    form.querySelector("[data-uri-example]").textContent = examples[type];
    form.querySelector("[data-database-label]").textContent = type === "redis" ? "Numéro de base (0–15)" : "Base de données";
  };
  form.querySelectorAll(".type").forEach((b) =>
    b.addEventListener("click", () => {
      typeInput.value = b.dataset.type;
      applyType();
    }),
  );
  form.querySelector("[data-tabs]").addEventListener("tabchange", (e) => (modeInput.value = e.detail));
  applyType();

  const status = form.querySelector("[data-test-status]");
  form.querySelector("[data-test]").addEventListener("click", async () => {
    status.hidden = false;
    status.className = "status loading";
    status.textContent = "Connexion en cours…";
    try {
      const data = new FormData(form);
      data.delete("_method");
      const res = await fetch(form.dataset.testUrl, {
        method: "POST",
        headers: { "X-CSRF-TOKEN": csrf, Accept: "application/json" },
        body: data,
      });
      const body = await res.json();
      if (res.status === 422) throw new Error(Object.values(body.errors).flat().join(" "));
      status.className = body.ok ? "status ok" : "status error";
      status.textContent = body.ok ? `Connexion réussie — ${body.version}` : body.error;
    } catch (error) {
      status.className = "status error";
      status.textContent = error.message;
    }
  });
});
