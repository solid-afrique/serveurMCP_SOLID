// Génère ../Presentation-Serveur-MCP.pptx (présentation non technique de la solution).
// Usage : npm install (dans docs/source), puis node build-pptx.cjs
const pptxgen = require('pptxgenjs');
const path = require('path');

const C = { blue: '2175B0', navy: '123B5C', ink: '1F2937', muted: '6B7280', soft: 'F3F7FA', line: 'E5E7EB', white: 'FFFFFF', green: '0F7A3D', greenSoft: 'E6F6EC', amber: 'B7791F' };
const F = 'Segoe UI', FB = 'Segoe UI Semibold';
const img = name => path.join(__dirname, 'img', name);

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE'; // 13,33 x 7,5 pouces
pptx.title = 'Serveur MCP — Interrogez nos données avec l’IA';
pptx.company = 'SOLID Afrique';
pptx.author = 'SOLID Afrique';

pptx.defineSlideMaster({
  title: 'CONTENU',
  background: { color: C.white },
  objects: [
    { rect: { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C.blue } } },
    { text: { text: 'Serveur MCP · SOLID Afrique', options: { x: 0.6, y: 7.0, w: 6, h: 0.3, fontFace: F, fontSize: 10, color: C.muted } } },
  ],
  slideNumber: { x: 12.3, y: 7.0, w: 0.6, h: 0.3, fontFace: F, fontSize: 10, color: C.muted, align: 'right' },
});

function title(slide, text, sub) {
  slide.addText(text, { x: 0.6, y: 0.45, w: 12.1, h: 0.8, fontFace: FB, fontSize: 30, color: C.navy, bold: true });
  if (sub) slide.addText(sub, { x: 0.6, y: 1.2, w: 12.1, h: 0.5, fontFace: F, fontSize: 16, color: C.muted });
}

function card(slide, x, y, w, h, head, body, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: opts.fill || C.soft }, line: { color: opts.line || C.soft } });
  if (opts.num) {
    slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.3, y: y + 0.3, w: 0.62, h: 0.62, fill: { color: C.blue }, line: { color: C.blue } });
    slide.addText(String(opts.num), { x: x + 0.3, y: y + 0.3, w: 0.62, h: 0.62, align: 'center', valign: 'middle', fontFace: FB, fontSize: 20, bold: true, color: C.white });
  }
  const top = opts.num ? y + 1.1 : y + 0.3;
  slide.addText(head, { x: x + 0.3, y: top, w: w - 0.6, h: opts.num ? 0.95 : 0.6, fontFace: FB, fontSize: 19, bold: true, color: C.navy, valign: 'top' });
  const gap = opts.num ? 1.0 : 0.62;
  slide.addText(body, { x: x + 0.3, y: top + gap, w: w - 0.6, h: h - (top - y) - gap - 0.2, fontFace: F, fontSize: 15, color: C.ink, valign: 'top', paraSpaceAfter: 4 });
}

function arrow(slide, x, y) {
  slide.addShape(pptx.ShapeType.rightArrow, { x, y, w: 0.5, h: 0.4, fill: { color: C.blue }, line: { color: C.blue } });
}

function chips(slide, items, x, y, opts = {}) {
  let cx = x;
  for (const t of items) {
    const w = 0.35 + t.length * 0.13;
    slide.addShape(pptx.ShapeType.roundRect, { x: cx, y, w, h: 0.5, rectRadius: 0.25, fill: { color: opts.fill || 'E8F2F9' }, line: { color: opts.fill || 'E8F2F9' } });
    slide.addText(t, { x: cx, y, w, h: 0.5, align: 'center', valign: 'middle', fontFace: FB, fontSize: 14, color: opts.color || C.blue, bold: true });
    cx += w + 0.2;
  }
}

// 1. Titre
{
  const s = pptx.addSlide();
  s.background = { color: C.blue };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.9, w: 13.33, h: 1.6, fill: { color: '185A88' }, line: { color: '185A88' } });
  s.addText('SOLID AFRIQUE', { x: 0.8, y: 0.7, w: 8, h: 0.4, fontFace: FB, fontSize: 14, color: 'BBD6EB', bold: true, charSpacing: 4 });
  s.addText('Interrogez nos données\navec l’intelligence artificielle', { x: 0.8, y: 1.6, w: 11.5, h: 2.4, fontFace: FB, fontSize: 44, bold: true, color: C.white, valign: 'top' });
  s.addText('Le Serveur MCP : un accès simple et sécurisé à nos bases de données depuis Microsoft Copilot, Claude et ChatGPT', { x: 0.8, y: 4.0, w: 11, h: 1.0, fontFace: F, fontSize: 20, color: 'DDEBF6', valign: 'top' });
  s.addText('Présentation de la solution — octobre 2026', { x: 0.8, y: 6.35, w: 11, h: 0.5, fontFace: F, fontSize: 16, color: C.white });
  s.addNotes('Objectif de la présentation : expliquer ce que permet le Serveur MCP, comment il s’utilise au quotidien et comment l’accès aux données reste maîtrisé.');
}

// 2. Le constat
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Le constat', 'Nos données sont précieuses, mais difficiles à consulter rapidement');
  const w = 3.85, y = 2.1, h = 3.9;
  card(s, 0.6, y, w, h, 'Des données dispersées', 'Ventes, stock, comptabilité, ressources humaines… chaque activité a sa propre base de données.', { num: 1 });
  card(s, 0.6 + w + 0.28, y, w, h, 'Un accès réservé aux spécialistes', 'Pour obtenir un chiffre, il faut savoir écrire des requêtes ou passer par l’équipe informatique.', { num: 2 });
  card(s, 0.6 + 2 * (w + 0.28), y, w, h, 'Des délais', 'Une question simple peut attendre un rapport ou un export pendant plusieurs jours.', { num: 3 });
  s.addNotes('Partir des situations vécues : « combien avons-nous vendu à tel client ce mois-ci ? » nécessite aujourd’hui une demande ou une extraction manuelle.');
}

// 3. La solution
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Notre solution : le Serveur MCP');
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 1.5, w: 12.1, h: 1.7, rectRadius: 0.15, fill: { color: 'E8F2F9' }, line: { color: 'E8F2F9' } });
  s.addText([
    { text: 'Un pont sécurisé entre nos bases de données et les assistants d’IA', options: { fontFace: FB, bold: true, color: C.navy, fontSize: 24, breakLine: true } },
    { text: 'Vous posez votre question en français ; l’assistant va chercher la réponse directement dans nos bases.', options: { fontFace: F, color: C.ink, fontSize: 18 } },
  ], { x: 0.9, y: 1.6, w: 11.5, h: 1.5, valign: 'middle' });
  s.addText('Fonctionne avec les assistants que nous utilisons déjà', { x: 0.6, y: 3.6, w: 12, h: 0.5, fontFace: FB, fontSize: 18, bold: true, color: C.navy });
  chips(s, ['Microsoft Copilot', 'Claude', 'ChatGPT', 'Cursor', 'et autres outils compatibles'], 0.6, 4.2);
  s.addText('Et avec nos bases de données', { x: 0.6, y: 5.0, w: 12, h: 0.5, fontFace: FB, fontSize: 18, bold: true, color: C.navy });
  chips(s, ['MySQL', 'SQL Server', 'PostgreSQL', 'MongoDB', 'Redis'], 0.6, 5.6, { fill: C.greenSoft, color: C.green });
  s.addNotes('MCP (Model Context Protocol) est un standard ouvert adopté par les principaux assistants d’IA. Nous ne dépendons donc pas d’un seul fournisseur.');
}

// 4. Comment ça marche
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Comment ça marche ?', 'Trois étapes, sans compétence technique');
  const w = 3.6, y = 2.1, h = 3.8;
  card(s, 0.6, y, w, h, 'Vous posez une question', '« Quel est le chiffre d’affaires par agence ce trimestre ? »', { num: 1 });
  arrow(s, 0.6 + w + 0.12, y + 1.7);
  card(s, 0.6 + w + 0.75, y, w, h, 'L’assistant consulte la base', 'Il passe par le Serveur MCP, qui vérifie vos droits avant chaque consultation.', { num: 2 });
  arrow(s, 0.6 + 2 * w + 0.87, y + 1.7);
  card(s, 0.6 + 2 * (w + 0.75), y, w, h, 'Vous obtenez la réponse', 'Tableau, synthèse, comparaison ou graphique, en quelques secondes.', { num: 3, fill: C.greenSoft, line: C.greenSoft });
  s.addNotes('L’assistant explore d’abord la structure de la base, puis construit lui-même les requêtes. L’utilisateur peut demander à voir le détail du calcul.');
}

// 5. Exemple
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Un exemple concret');
  s.addShape(pptx.ShapeType.roundRect, { x: 5.2, y: 1.5, w: 7.5, h: 0.85, rectRadius: 0.2, fill: { color: C.blue }, line: { color: C.blue } });
  s.addText('Quels sont nos 5 meilleurs clients ce trimestre, et leur évolution par rapport à l’an dernier ?', { x: 5.4, y: 1.5, w: 7.1, h: 0.85, fontFace: F, fontSize: 15, color: C.white, valign: 'middle' });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 2.65, w: 9.2, h: 3.95, rectRadius: 0.15, fill: { color: C.soft }, line: { color: C.line } });
  s.addText('Voici les 5 meilleurs clients du 3e trimestre 2026 :', { x: 0.85, y: 2.8, w: 8.7, h: 0.45, fontFace: F, fontSize: 15, color: C.ink });
  const head = ['Client', 'CA T3 2026', 'Évolution'].map(t => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.navy }, fontFace: FB } }));
  const rows = [['Client A', '48,2 M FCFA', '+12 %'], ['Client B', '41,7 M FCFA', '+4 %'], ['Client C', '35,9 M FCFA', '−3 %'], ['Client D', '29,4 M FCFA', '+21 %'], ['Client E', '27,1 M FCFA', '+8 %']]
    .map(r => r.map((t, i) => ({ text: t, options: { align: i ? 'right' : 'left', color: i === 2 ? (t.startsWith('−') ? 'B42318' : C.green) : C.ink } })));
  s.addTable([head, ...rows], { x: 0.85, y: 3.3, w: 8.7, colW: [3.9, 2.6, 2.2], fontFace: F, fontSize: 14, border: { type: 'solid', color: C.line, pt: 0.75 }, fill: { color: C.white }, rowH: 0.42 });
  s.addText('Le client D progresse le plus (+21 %), le client C recule légèrement.', { x: 0.85, y: 5.9, w: 8.7, h: 0.5, fontFace: F, fontSize: 14, color: C.ink, italic: true });
  s.addText('Exemple illustratif — données fictives', { x: 10.0, y: 6.2, w: 2.7, h: 0.4, fontFace: F, fontSize: 11, color: C.muted, align: 'right' });
  s.addNotes('Une question en langage courant, une réponse structurée et commentée. L’utilisateur peut enchaîner : « Montre-moi le détail du client C par produit ».');
}

// 6. Bénéfices
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Ce que ça nous apporte');
  const items = [
    ['Autonomie', 'Chacun obtient lui-même les chiffres dont il a besoin, sans écrire de requête.'],
    ['Rapidité', 'Une réponse en quelques secondes au lieu d’attendre un rapport.'],
    ['Une seule porte d’entrée', 'Toutes nos bases, quel que soit leur type, accessibles de la même façon.'],
    ['Liberté de choix', 'Compatible avec plusieurs assistants : nous ne dépendons pas d’un fournisseur unique.'],
  ];
  items.forEach(([h, b], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.6 + Math.floor(i / 2) * 2.55;
    card(s, x, y, 5.95, 2.3, h, b);
    s.addShape(pptx.ShapeType.rect, { x, y: y + 0.25, w: 0.08, h: 1.8, fill: { color: C.blue }, line: { color: C.blue } });
  });
  s.addNotes('Le service informatique reste maître des bases ouvertes et des droits ; il est libéré des demandes d’extraction simples.');
}

// 7. Sécurité
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Sécurité et contrôle', 'L’accès aux données reste entièrement maîtrisé');
  const points = [
    ['Chacun avec son propre compte', 'L’assistant agit au nom de la personne, avec ses droits, après son autorisation explicite.'],
    ['L’administrateur décide', 'qui a accès à quelle base de données ; personne ne peut s’inscrire seul.'],
    ['Lecture seule par défaut', 'L’assistant consulte les données mais ne peut pas les modifier.'],
    ['Accès retiré immédiatement', 'Retirer un droit ou désactiver un compte prend effet à la question suivante.'],
    ['Nos bases restent chez nous', 'Elles ne sont pas exposées sur Internet ; les mots de passe sont chiffrés.'],
  ];
  points.forEach(([h, b], i) => {
    const y = 1.85 + i * 0.86;
    s.addShape(pptx.ShapeType.ellipse, { x: 0.65, y: y + 0.08, w: 0.42, h: 0.42, fill: { color: C.green }, line: { color: C.green } });
    s.addText('✓', { x: 0.65, y: y + 0.08, w: 0.42, h: 0.42, align: 'center', valign: 'middle', fontFace: FB, fontSize: 14, bold: true, color: C.white });
    s.addText([{ text: h + ' — ', options: { fontFace: FB, bold: true, color: C.navy } }, { text: b, options: { fontFace: F, color: C.ink } }], { x: 1.3, y, w: 11.4, h: 0.6, fontSize: 16, valign: 'middle' });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 6.2, w: 12.1, h: 0.6, rectRadius: 0.1, fill: { color: 'FFF6E0' }, line: { color: 'FFF6E0' } });
  s.addText('À retenir : les réponses transitent par l’assistant utilisé. Nous n’utilisons que des assistants validés par l’entreprise, avec des comptes professionnels.', { x: 0.8, y: 6.2, w: 11.8, h: 0.6, fontFace: F, fontSize: 13, color: '7A4F00', valign: 'middle' });
  s.addNotes('Point de vigilance à présenter honnêtement : pour répondre, l’assistant reçoit le résultat des requêtes. Le choix des bases ouvertes et des comptes lecteurs (qui limitent les colonnes visibles) en tient compte.');
}

// 8. Rôles
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Qui fait quoi ?');
  const col = (x, head, color, lines) => {
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: 5.95, h: 5.1, rectRadius: 0.15, fill: { color: C.soft }, line: { color: C.soft } });
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: 5.95, h: 0.9, rectRadius: 0.15, fill: { color }, line: { color } });
    s.addText(head, { x: x + 0.3, y: 1.5, w: 5.4, h: 0.9, fontFace: FB, fontSize: 22, bold: true, color: C.white, valign: 'middle' });
    s.addText(lines.map(t => ({ text: t, options: { bullet: { indent: 18 }, breakLine: true } })), { x: x + 0.3, y: 2.6, w: 5.4, h: 3.8, fontFace: F, fontSize: 16, color: C.ink, valign: 'top', paraSpaceAfter: 10 });
  };
  col(0.6, 'Administrateur', C.navy, ['Invite les collaborateurs (envoi automatique par e-mail)', 'Déclare les bases de données', 'Crée et publie les agents Copilot', 'Décide qui accède à quelle base, et peut retirer un accès à tout moment']);
  col(6.75, 'Collaborateur', C.blue, ['Active son compte depuis l’e-mail reçu', 'Ouvre l’agent de sa base dans Copilot et autorise son compte', 'Pose ses questions en français', 'Gère ses autorisations depuis « Mon compte »']);
  s.addNotes('Le rôle d’administrateur est attribué à quelques personnes de l’équipe informatique. Un collaborateur peut aussi déclarer une base dont il possède lui-même les accès ; elle reste privée.');
}

// 9 à 14. Parcours d'un nouvel utilisateur : invitation → mot de passe → connexion → lien MCP → assistant
const SITE = 'https://luxewtey.com/mcpsolid';
const ETAPES = [
  ['Administrateur', 'Envoie l’invitation', 'Saisit l’e-mail du collaborateur : le lien d’invitation part automatiquement.'],
  ['Collaborateur', 'Crée son mot de passe', 'Ouvre le lien reçu par e-mail et choisit son mot de passe.'],
  ['Collaborateur', 'Se connecte', `Sur ${SITE}, avec son e-mail et son mot de passe.`],
  ['Collaborateur', 'Copie son lien MCP', 'Le lien de chaque base que l’administrateur lui a attribuée.'],
  ['Collaborateur', 'Branche son assistant', 'Colle le lien dans Claude, ChatGPT ou Copilot, puis clique sur « Autoriser ».'],
];

// Pastilles d'avancement (en haut à droite) : étapes actives en couleur.
function progress(slide, active) {
  ETAPES.forEach((_, i) => {
    const on = active.includes(i + 1);
    const x = 10.15 + i * 0.52;
    slide.addShape(pptx.ShapeType.ellipse, { x, y: 1.31, w: 0.4, h: 0.4, fill: { color: on ? C.blue : 'E8F2F9' }, line: { color: on ? C.blue : 'BBD6EB' } });
    slide.addText(String(i + 1), { x, y: 1.31, w: 0.4, h: 0.4, align: 'center', valign: 'middle', fontFace: FB, fontSize: 12, bold: true, color: on ? C.white : C.blue });
  });
}

function who(slide, label, y = 1.3) {
  const admin = label === 'Administrateur';
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.6, y, w: 2.3, h: 0.42, rectRadius: 0.21, fill: { color: admin ? C.navy : C.blue }, line: { color: admin ? C.navy : C.blue } });
  slide.addText(admin ? 'L’administrateur' : 'Le collaborateur', { x: 0.6, y, w: 2.3, h: 0.42, align: 'center', valign: 'middle', fontFace: FB, fontSize: 13, bold: true, color: C.white });
}

// Liste d'actions numérotées (colonne de gauche).
function actions(slide, items, x = 0.6, y = 2.0, w = 5.5) {
  let cy = y;
  items = items.map(t => t.replace(/« /g, '« ').replace(/ ([»:?;!])/g, ' $1'));
  items.forEach((t, i) => {
    const lines = Math.ceil(t.replace(/\*\*/g, '').length / ((w - 0.55) * 10));
    const h = 0.3 * lines + 0.18;
    slide.addShape(pptx.ShapeType.ellipse, { x, y: cy + 0.02, w: 0.4, h: 0.4, fill: { color: 'E8F2F9' }, line: { color: C.blue } });
    slide.addText(String(i + 1), { x, y: cy + 0.02, w: 0.4, h: 0.4, align: 'center', valign: 'middle', fontFace: FB, fontSize: 13, bold: true, color: C.blue });
    // **texte** = gras
    const runs = t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(p => p.startsWith('**')
      ? { text: p.slice(2, -2), options: { fontFace: FB, bold: true, color: C.navy } }
      : { text: p, options: { fontFace: F, color: C.ink } });
    slide.addText(runs, { x: x + 0.55, y: cy - 0.04, w: w - 0.55, h, fontSize: 15, valign: 'top' });
    cy += h + 0.12;
  });
  return cy;
}

function shot(slide, name, x, y, w, ratio, caption) {
  const h = w / ratio;
  slide.addShape(pptx.ShapeType.roundRect, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, rectRadius: 0.06, fill: { color: C.white }, line: { color: 'D6DEE6' } });
  slide.addImage({ path: img(name), x, y, w, h });
  if (caption) slide.addText(caption, { x, y: y + h + 0.06, w, h: 0.32, fontFace: F, fontSize: 11, color: C.muted, align: 'center' });
  return y + h;
}

function tip(slide, text, y = 6.25, color = 'FFF6E0', ink = '7A4F00') {
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.6, y, w: 12.1, h: 0.55, rectRadius: 0.1, fill: { color }, line: { color } });
  slide.addText(text, { x: 0.8, y, w: 11.8, h: 0.55, fontFace: F, fontSize: 13, color: ink, valign: 'middle' });
}

// 9. Vue d'ensemble du parcours
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Le parcours d’un nouvel utilisateur', 'De l’invitation à la première question, en cinq étapes');
  const w = 2.2, gap = 0.275;
  ETAPES.forEach(([role, head, body], i) => {
    const x = 0.6 + i * (w + gap), y = 2.0, admin = role === 'Administrateur';
    s.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 3.6, rectRadius: 0.12, fill: { color: admin ? 'E9EEF3' : C.soft }, line: { color: admin ? 'E9EEF3' : C.soft } });
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.2, y: y + 0.22, w: 0.6, h: 0.6, fill: { color: C.blue }, line: { color: C.blue } });
    s.addText(String(i + 1), { x: x + 0.2, y: y + 0.22, w: 0.6, h: 0.6, align: 'center', valign: 'middle', fontFace: FB, fontSize: 20, bold: true, color: C.white });
    s.addText(role, { x: x + 0.2, y: y + 0.95, w: w - 0.4, h: 0.32, fontFace: FB, fontSize: 11, bold: true, color: admin ? C.navy : C.blue, charSpacing: 1 });
    s.addText(head, { x: x + 0.2, y: y + 1.28, w: w - 0.4, h: 0.8, fontFace: FB, fontSize: 16, bold: true, color: C.navy, valign: 'top' });
    s.addText(body, { x: x + 0.2, y: y + 2.1, w: w - 0.4, h: 1.4, fontFace: F, fontSize: 12.5, color: C.ink, valign: 'top' });
    if (i < ETAPES.length - 1) s.addShape(pptx.ShapeType.rightArrow, { x: x + w + 0.02, y: y + 1.6, w: 0.24, h: 0.3, fill: { color: C.blue }, line: { color: C.blue } });
  });
  tip(s, 'Ensuite, il pose ses questions en français, directement dans son assistant. Les étapes 1 à 4 ne se font qu’une fois.', 6.0, C.greenSoft, C.green);
  s.addNotes('Vue d’ensemble : seule la première étape revient à l’administrateur. Les diapositives suivantes détaillent chaque étape avec les écrans réels.');
}

// 10. Étape 1 : l'administrateur envoie l'invitation
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Étape 1 — L’administrateur envoie l’invitation');
  progress(s, [1]);
  who(s, 'Administrateur');
  actions(s, [
    'Dans l’onglet **Utilisateurs**, il saisit l’**e-mail** du collaborateur (et son nom).',
    'Il clique sur **Créer et envoyer l’invitation** : le lien part automatiquement par e-mail.',
    'Il lui **attribue les bases** dont il a besoin (Connexions → **Gérer l’accès**).',
  ]);
  shot(s, 'p-invitation-admin.png', 6.55, 2.0, 6.1, 1210 / 620, 'Le message vert confirme l’envoi de l’e-mail');
  tip(s, 'Si l’e-mail n’arrive pas, « Afficher le lien » permet de le transmettre autrement (messagerie interne). Le lien est valable 7 jours.', 5.95);
  s.addNotes('Aucune inscription libre : seul un administrateur peut créer un compte. Sans attribution de base, le collaborateur verra une liste vide.');
}

// 11. Étape 2 : le collaborateur crée son mot de passe
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Étape 2 — Le collaborateur crée son mot de passe');
  progress(s, [2]);
  who(s, 'Collaborateur');
  actions(s, [
    'Il reçoit l’e-mail **« Votre invitation au Serveur MCP »**.',
    'Il clique sur **Activer mon compte**.',
    'Il choisit son **mot de passe** (10 caractères minimum), le confirme, puis valide : son compte est actif et il est connecté.',
  ], 0.6, 2.0, 5.3);
  shot(s, '02-email-invitation.png', 6.2, 1.75, 3.55, 1140 / 1095, 'L’e-mail reçu');
  shot(s, '03-activation.png', 10.0, 2.25, 2.75, 642 / 557, 'Le choix du mot de passe');
  tip(s, 'Le lien est personnel et ne sert qu’une fois. S’il a expiré, l’administrateur clique sur « Renvoyer l’invitation ».', 6.0);
  s.addNotes('Le même mécanisme sert à réinitialiser un mot de passe oublié : l’administrateur envoie un lien de réinitialisation.');
}

// 12. Étapes 3 et 4 : se connecter et copier son lien MCP
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Étapes 3 et 4 — Se connecter et copier son lien MCP');
  progress(s, [3, 4]);
  who(s, 'Collaborateur');
  actions(s, [
    `Il ouvre **${SITE}** et se connecte avec son e-mail et son mot de passe.`,
    'Dans **Mes connexions**, chaque base attribuée a son propre **lien MCP** : il clique sur **Copier**.',
    'Une base manque ? Il demande à l’**administrateur** de la lui attribuer : elle apparaît aussitôt dans la liste, avec son lien.',
  ], 0.6, 2.0, 5.6);
  shot(s, 'p-lien-mcp.png', 6.55, 2.0, 6.1, 1180 / 410, 'Le lien MCP de la base et son bouton « Copier »');
  shot(s, '01-connexion.png', 6.55, 4.55, 1.85, 642 / 632);
  s.addText('La page de connexion du serveur : un seul compte pour l’interface et pour les assistants.', { x: 8.6, y: 4.75, w: 4.05, h: 1.0, fontFace: F, fontSize: 13, color: C.muted, valign: 'top' });
  s.addNotes('Le lien MCP n’est pas un secret : sans l’autorisation que chaque utilisateur donne avec son compte (étape 5), il ne donne accès à rien.');
}

// 13. Étape 5 : brancher son assistant
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Étape 5 — Brancher son assistant');
  progress(s, [5]);
  who(s, 'Collaborateur');
  const cols = [
    ['Claude', ['**Paramètres → Connecteurs**', '**Ajouter un connecteur personnalisé**', 'Coller le lien MCP', 'Cliquer sur **Se connecter**']],
    ['ChatGPT', ['**Paramètres → Applications et connecteurs** (mode développeur)', 'Cliquer sur **Créer**', 'Coller le lien MCP, authentification **OAuth**']],
    ['Microsoft Copilot', ['Ouvrir l’**agent de la base** publié par l’entreprise dans Copilot ou Teams', 'Poser une première question', 'Cliquer sur **Se connecter**']],
  ];
  cols.forEach(([head, steps], i) => {
    const x = 0.6 + i * 4.1, y = 2.0, w = 3.9;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 3.55, rectRadius: 0.12, fill: { color: C.soft }, line: { color: C.soft } });
    s.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.62, rectRadius: 0.12, fill: { color: C.blue }, line: { color: C.blue } });
    s.addText(head, { x: x + 0.25, y, w: w - 0.5, h: 0.62, fontFace: FB, fontSize: 18, bold: true, color: C.white, valign: 'middle' });
    actions(s, steps, x + 0.25, y + 0.85, w - 0.4);
  });
  tip(s, 'Dans les trois cas, la page du Serveur MCP s’ouvre : il se connecte avec son compte et clique sur « Autoriser ».', 5.8, C.greenSoft, C.green);
  s.addText('Pour Copilot, l’administrateur crée l’agent une seule fois dans Copilot Studio avec le lien MCP de la base (voir le guide utilisateur).', { x: 0.6, y: 6.42, w: 12.1, h: 0.45, fontFace: F, fontSize: 12, color: C.muted });
  s.addNotes('Claude et ChatGPT : chaque collaborateur colle lui-même le lien. Copilot : l’agent est préparé une fois par l’administrateur dans Copilot Studio, puis chaque collaborateur autorise son propre compte.');
}

// 14. L'autorisation, puis les questions
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Autoriser, puis poser ses questions');
  progress(s, [5]);
  who(s, 'Collaborateur');
  const end = actions(s, [
    'L’écran **Autoriser l’accès** indique l’assistant, la base et le compte utilisés : il clique sur **Autoriser**.',
    'De retour dans son assistant, il pose ses questions : « Quelles sont nos ventes du mois par agence ? »',
    'Il peut retirer cette autorisation à tout moment depuis **Mon compte**.',
  ], 0.6, 2.0, 6.2);
  shot(s, '08-autorisation.png', 7.6, 1.75, 4.6, 642 / 570, 'L’écran d’autorisation : l’utilisateur garde la main');
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: end + 0.2, w: 6.2, h: 0.9, rectRadius: 0.1, fill: { color: C.greenSoft }, line: { color: C.greenSoft } });
  s.addText('L’assistant n’accède qu’aux bases autorisées pour ce collaborateur, en lecture seule le plus souvent.', { x: 0.8, y: end + 0.2, w: 5.8, h: 0.9, fontFace: FB, fontSize: 14, bold: true, color: C.green, valign: 'middle' });
  s.addNotes('Les droits sont vérifiés à chaque question : si l’administrateur retire l’accès à une base, l’assistant ne peut plus l’interroger.');
}

// 11. Prochaines étapes
{
  const s = pptx.addSlide({ masterName: 'CONTENU' });
  title(s, 'Prochaines étapes');
  const steps = [
    ['Mise en service', 'Installation sur notre serveur Windows (IIS)'],
    ['Premières bases', 'Raccordement des bases prioritaires, en lecture seule'],
    ['Pilote', 'Un groupe de collaborateurs volontaires et leurs retours'],
    ['Généralisation', 'Formation, guide utilisateur et ouverture progressive'],
  ];
  const w = 2.85;
  steps.forEach(([h, b], i) => {
    const x = 0.6 + i * (w + 0.23);
    s.addShape(pptx.ShapeType.chevron, { x, y: 1.9, w, h: 0.9, fill: { color: i === 0 ? C.blue : 'BBD6EB' }, line: { color: i === 0 ? C.blue : 'BBD6EB' } });
    s.addText(`Étape ${i + 1}`, { x, y: 1.9, w, h: 0.9, align: 'center', valign: 'middle', fontFace: FB, fontSize: 16, bold: true, color: i === 0 ? C.white : C.navy });
    s.addText(h, { x, y: 3.1, w, h: 0.6, fontFace: FB, fontSize: 19, bold: true, color: C.navy, align: 'center' });
    s.addText(b, { x, y: 3.7, w, h: 1.4, fontFace: F, fontSize: 15, color: C.ink, align: 'center', valign: 'top' });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 5.5, w: 12.1, h: 0.9, rectRadius: 0.12, fill: { color: C.greenSoft }, line: { color: C.greenSoft } });
  s.addText('La solution est installée sur notre serveur et déjà opérationnelle.', { x: 0.9, y: 5.5, w: 11.6, h: 0.9, fontFace: FB, fontSize: 18, bold: true, color: C.green, valign: 'middle' });
  s.addNotes('Adapter les étapes et le calendrier à la décision de la direction. La solution est en service sur le serveur IIS ; les étapes suivantes portent sur le raccordement des bases et l’accompagnement des utilisateurs.');
}

// 12. Merci
{
  const s = pptx.addSlide();
  s.background = { color: C.blue };
  s.addText('Merci', { x: 0.8, y: 2.3, w: 11.7, h: 1.3, fontFace: FB, fontSize: 54, bold: true, color: C.white });
  s.addText('Questions et échanges', { x: 0.8, y: 3.6, w: 11.7, h: 0.8, fontFace: F, fontSize: 26, color: 'DDEBF6' });
  s.addText('Adresse du service : https://luxewtey.com/mcpsolid', { x: 0.8, y: 5.75, w: 11.7, h: 0.5, fontFace: FB, fontSize: 18, bold: true, color: C.white });
  s.addText('Documents disponibles : guide utilisateur et documentation technique', { x: 0.8, y: 6.3, w: 11.7, h: 0.5, fontFace: F, fontSize: 15, color: 'BBD6EB' });
}

pptx.writeFile({ fileName: process.argv[2] || path.join(__dirname, '..', 'Presentation-Serveur-MCP.pptx') }).then(f => console.log('PPTX :', path.basename(f)));
