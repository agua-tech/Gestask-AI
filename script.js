let tareas = [];
let usuarioActual = null;
let filtroCategoria = 'todas';
let filtroEstado = 'todas';
let accionPendiente = null;
let calMes = new Date().getMonth();
let calAnio = new Date().getFullYear();
let sidebarAbierto = true;



const DEFAULT_CATS = [
    { id: 'personal', nombre: 'Personal', icono: '👤' },
    { id: 'trabajo',  nombre: 'Trabajo',  icono: '💼' },
    { id: 'estudio',  nombre: 'Estudio',  icono: '📚' }
];

function getCategoriasCustom() {
    return storage('tf_cats_custom_' + usuarioActual) || [];
}

function saveCategoriasCustom(cats) {
    storage('tf_cats_custom_' + usuarioActual, cats);
}

function todasLasCategorias() {
    const custom = getCategoriasCustom();
    return [...DEFAULT_CATS, ...custom];
}

function agregarCategoria() {
    const input = document.getElementById('nuevaCatInput');
    const nombre = input.value.trim();
    if (!nombre) { toast('Escribe un nombre para la categoría.', 'error'); return; }

    const id = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-áéíóúüñ]/gi, '');
    if (!id) { toast('Nombre inválido.', 'error'); return; }

    const todas = todasLasCategorias();
    const duplicado = todas.some(c => c.id === id || c.nombre.toLowerCase() === nombre.toLowerCase());
    if (duplicado) { toast('Esa categoría ya existe.', 'error'); return; }

    const cats = getCategoriasCustom();
    cats.push({ id, nombre, icono: '🏷️' });
    saveCategoriasCustom(cats);
    input.value = '';
    renderNavCategorias();
    renderCategoriaSelect();
    toast('Categoría "' + nombre + '" creada ✓', 'success');
}

function eliminarCategoriaCustom(id) {
    const cats = getCategoriasCustom().filter(c => c.id !== id);
    saveCategoriasCustom(cats);
    if (filtroCategoria === id) {
        filtrarCategoria('todas');
    } else {
        renderNavCategorias();
        renderCategoriaSelect();
    }
    toast('Categoría eliminada.', '');
}

function renderNavCategorias() {
    const container = document.getElementById('navCategorias');
    if (!container) return;
    container.innerHTML = '';

    const btnTodas = document.createElement('button');
    btnTodas.classList.add('nav-item');
    if (filtroCategoria === 'todas') btnTodas.classList.add('active');
    btnTodas.setAttribute('data-cat', 'todas');
    btnTodas.onclick = () => filtrarCategoria('todas');
    btnTodas.innerHTML = '<span class="nav-icon">🗂️</span> Todas <span class="nav-count">' + tareas.length + '</span>';
    container.appendChild(btnTodas);

    DEFAULT_CATS.forEach(cat => {
        const count = tareas.filter(t => t.categoria === cat.id).length;
        const btn = document.createElement('button');
        btn.classList.add('nav-item');
        if (filtroCategoria === cat.id) btn.classList.add('active');
        btn.setAttribute('data-cat', cat.id);
        btn.onclick = () => filtrarCategoria(cat.id);
        btn.innerHTML = '<span class="nav-icon">' + cat.icono + '</span> ' + cat.nombre + ' <span class="nav-count">' + count + '</span>';
        container.appendChild(btn);
    });

    const custom = getCategoriasCustom();
    if (custom.length > 0) {
        const sep = document.createElement('p');
        sep.classList.add('nav-label');
        sep.style.marginTop = '10px';
        sep.textContent = 'Personalizadas';
        container.appendChild(sep);

        custom.forEach(cat => {
            const count = tareas.filter(t => t.categoria === cat.id).length;
            const btn = document.createElement('button');
            btn.classList.add('nav-item', 'nav-item-anim');
            if (filtroCategoria === cat.id) btn.classList.add('active');
            btn.setAttribute('data-cat', cat.id);
            btn.onclick = () => filtrarCategoria(cat.id);

            const delBtn = document.createElement('button');
            delBtn.classList.add('nav-item-del');
            delBtn.innerHTML = '✕';
            delBtn.title = 'Eliminar categoría';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                eliminarCategoriaCustom(cat.id);
            };

            btn.innerHTML = '<span class="nav-icon">' + cat.icono + '</span> ' + cat.nombre + ' <span class="nav-count">' + count + '</span>';
            btn.appendChild(delBtn);
            container.appendChild(btn);
        });
    }
}

function renderCategoriaSelect() {
    const sel = document.getElementById('categoriaSelect');
    if (!sel) return;
    const valorActual = sel.value;
    sel.innerHTML = '';
    todasLasCategorias().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.icono + ' ' + cat.nombre;
        sel.appendChild(opt);
    });
    if (valorActual && [...sel.options].some(o => o.value === valorActual)) {
        sel.value = valorActual;
    }
}

// ══════════════════════════════════════════════
// SISTEMA DE ENERGÍA — constantes y helpers
// ══════════════════════════════════════════════

const ENERGIA_CONFIG = {
    alta:   { label: 'Concentración', clase: 'energia-alta'   },
    normal: { label: 'Normal',        clase: 'energia-normal' },
    baja:   { label: 'Baja energía',  clase: 'energia-baja'  }
};

// Energía recomendada según la hora del día
function _getEnergiaHora() {
    const h = new Date().getHours();
    if (h >= 6  && h < 12) return 'alta';
    if (h >= 14 && h < 17) return 'baja';
    return 'normal';
}

// ══════════════════════════════════════════════
// MODO HOY — algoritmo de scoring y render
// ══════════════════════════════════════════════

function _scoreTarea(t) {
    let score = 0;
    const hoy = new Date().toISOString().split('T')[0];

    // Prioridad
    if (t.prioridad === 'alta') score += 30;
    else if (t.prioridad === 'media') score += 15;
    else score += 5;

    // Urgencia por fecha límite
    if (t.fecha) {
        const diff = Math.floor((new Date(t.fecha) - new Date(hoy)) / 86400000);
        if (diff < 0)       score += 50; // vencida
        else if (diff === 0) score += 40; // hoy
        else if (diff === 1) score += 30;
        else if (diff <= 3)  score += 20;
        else if (diff <= 7)  score += 10;
    }

    // Energía vs momento del día
    const energiaIdeal = _getEnergiaHora();
    const energiaTarea = t.energia || 'normal';
    if (energiaTarea === energiaIdeal) score += 12;
    else if (energiaTarea === 'baja' && energiaIdeal !== 'alta') score += 5;

    return score;
}

function calcularModoHoy() {
    const pendientes = tareas.filter(t => !t.completada);
    return pendientes
        .map(t => ({ ...t, _score: _scoreTarea(t) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 5);
}

let _modoHoyAbierto = false;

function abrirModoHoy() {
    _modoHoyAbierto = true;
    const panel = document.getElementById('modoHoyPanel');
    if (!panel) return;
    renderModoHoy();
    panel.classList.add('activo');
    document.body.style.overflow = 'hidden';
}

function cerrarModoHoy() {
    _modoHoyAbierto = false;
    const panel = document.getElementById('modoHoyPanel');
    if (panel) panel.classList.remove('activo');
    document.body.style.overflow = '';
}

function renderModoHoy() {
    const lista = calcularModoHoy();
    const container = document.getElementById('modoHoyLista');
    const energia = _getEnergiaHora();
    const energiaLabel = ENERGIA_CONFIG[energia]?.label || 'Normal';

    document.getElementById('modoHoyEnergia').textContent = energiaLabel;

    if (!container) return;
    container.innerHTML = '';
    const hoy = new Date().toISOString().split('T')[0];

    if (lista.length === 0) {
        container.innerHTML = '<p class="modo-hoy-vacio">Sin tareas pendientes. Estás al día.</p>';
        return;
    }

    lista.forEach((t, idx) => {
        const div = document.createElement('div');
        div.classList.add('modo-hoy-item');
        if (t.completada) div.classList.add('completada');

        const num = document.createElement('span');
        num.classList.add('modo-hoy-num');
        num.textContent = idx + 1;

        const info = document.createElement('div');
        info.classList.add('modo-hoy-info');

        const titulo = document.createElement('p');
        titulo.classList.add('modo-hoy-titulo');
        titulo.textContent = t.texto;

        const tags = document.createElement('div');
        tags.classList.add('modo-hoy-tags');

        const prioridadTexto = { alta: 'Alta', media: 'Media', baja: 'Baja' };
        const tagP = document.createElement('span');
        tagP.classList.add('modo-hoy-tag');
        tagP.textContent = 'Prioridad: ' + (prioridadTexto[t.prioridad] || t.prioridad);

        tags.appendChild(tagP);

        if (t.energia) {
            const tagE = document.createElement('span');
            tagE.classList.add('modo-hoy-tag', 'tag-e-' + t.energia);
            tagE.textContent = ENERGIA_CONFIG[t.energia]?.label || t.energia;
            tags.appendChild(tagE);
        }

        if (t.fecha) {
            const diff = Math.floor((new Date(t.fecha) - new Date(hoy)) / 86400000);
            const tagF = document.createElement('span');
            tagF.classList.add('modo-hoy-tag', diff < 0 ? 'tag-vencida' : 'tag-fecha');
            tagF.textContent = diff < 0 ? 'Vencida' : diff === 0 ? 'Hoy' : formatearFecha(t.fecha);
            tags.appendChild(tagF);
        }

        info.append(titulo, tags);

        const btn = document.createElement('button');
        btn.classList.add('modo-hoy-check');
        btn.innerHTML = t.completada ? '✓' : '';
        btn.title = t.completada ? 'Reabrir' : 'Completar';
        btn.onclick = () => {
            toggleCompletada(t.id);
            setTimeout(renderModoHoy, 200);
        };

        div.append(num, info, btn);
        container.appendChild(div);
    });
}

// ── Utilidades localStorage ──
function storage(key, val) {
    if (val === undefined) {
        try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    }
    localStorage.setItem(key, JSON.stringify(val));
}

function getUsuarios() { return storage('tf_usuarios') || {}; }
function saveUsuarios(u) { storage('tf_usuarios', u); }
function getTareasUsuario() { return storage('tf_tareas_' + usuarioActual) || []; }
function saveTareas() { storage('tf_tareas_' + usuarioActual, tareas); }

// ══════════════════════════════════════════════
// PERFIL ADAPTATIVO — aprende del comportamiento del usuario
// ══════════════════════════════════════════════

function getPerfil() {
    return storage('tf_perfil_' + usuarioActual) || {
        sesiones:          0,
        horasActivas:      {},
        accionesPorHora:   {},
        catConteo:         {},
        tareasCreadas:     0,
        tareasCompletadas: 0,
        rachaActual:       0,
        ultimaFechaActiva: null
    };
}

function savePerfil(p) {
    storage('tf_perfil_' + usuarioActual, p);
}

function registrarComportamiento(evento, extra) {
    if (!usuarioActual) return;
    const p   = getPerfil();
    const h   = String(new Date().getHours());
    const hoy = new Date().toISOString().split('T')[0];

    p.horasActivas[h] = (p.horasActivas[h] || 0) + 1;

    if (evento === 'login') {
        p.sesiones = (p.sesiones || 0) + 1;

        // Racha diaria
        if (p.ultimaFechaActiva) {
            const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            if (p.ultimaFechaActiva === ayer)      p.rachaActual = (p.rachaActual || 0) + 1;
            else if (p.ultimaFechaActiva !== hoy)  p.rachaActual = 1;
        } else {
            p.rachaActual = 1;
        }

        // Contar visitas del día (para detección de procrastinación)
        if (p.ultimaFechaActiva === hoy) {
            p.visitasHoy = (p.visitasHoy || 1) + 1;
        } else {
            p.visitasHoy = 1;
        }

        p.ultimaFechaActiva = hoy;
    }

    if (evento === 'crear') {
        p.tareasCreadas = (p.tareasCreadas || 0) + 1;
        p.accionesPorHora[h] = (p.accionesPorHora[h] || 0) + 1;
        if (extra) p.catConteo[extra] = (p.catConteo[extra] || 0) + 1;
    }

    if (evento === 'completar') {
        p.tareasCompletadas = (p.tareasCompletadas || 0) + 1;
        p.accionesPorHora[h] = (p.accionesPorHora[h] || 0) + 1;
        p.ultimaFechaActiva  = hoy;
    }

    savePerfil(p);
}

function _buildPerfilResumen() {
    const p = getPerfil();

    const acciones  = p.accionesPorHora || {};
    const horaPico  = Object.keys(acciones).sort((a, b) => acciones[b] - acciones[a])[0];
    let momentoPico = 'sin datos aún';
    if (horaPico !== undefined) {
        const h = parseInt(horaPico);
        if      (h >= 5  && h < 12) momentoPico = 'mañana (pico ~' + horaPico + 'h)';
        else if (h >= 12 && h < 17) momentoPico = 'tarde (pico ~' + horaPico + 'h)';
        else if (h >= 17 && h < 21) momentoPico = 'noche (pico ~' + horaPico + 'h)';
        else                         momentoPico = 'madrugada (pico ~' + horaPico + 'h)';
    }

    const cats   = p.catConteo || {};
    const catFav = Object.keys(cats).sort((a, b) => cats[b] - cats[a])[0] || 'sin datos';

    const creadas     = p.tareasCreadas     || 0;
    const completadas = p.tareasCompletadas || 0;
    const tasa = creadas > 0 ? Math.round((completadas / creadas) * 100) : 0;

    let tendencia = 'Usuario nuevo, sin suficientes datos.';
    if (creadas >= 5) {
        if      (tasa >= 70) tendencia = 'Alta completación (' + tasa + '%) — muy consistente';
        else if (tasa >= 40) tendencia = 'Completación media (' + tasa + '%) — puede mejorar foco';
        else                 tendencia = 'Baja completación (' + tasa + '%) — sugiere reducir carga o motivar';
    }

    return [
        'PERFIL DE COMPORTAMIENTO DEL USUARIO (aprende y adapta tu tono a esto):',
        '- Sesiones registradas: '        + (p.sesiones || 0),
        '- Racha activa: '                + (p.rachaActual || 0) + ' día(s) consecutivo(s)',
        '- Momento más productivo: '      + momentoPico,
        '- Categoría más usada: '         + catFav,
        '- Total tareas creadas: '        + creadas,
        '- Total tareas completadas: '    + completadas,
        '- Tendencia de comportamiento: ' + tendencia
    ].join('\n');
}

// ── Números Unicode negrita ──
function toBoldNum(n) {
    const map = {
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰',
        '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    };
    return String(n).split('').map(c => map[c] !== undefined ? map[c] : c).join('');
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
    if (tab === 'login') {
        document.querySelectorAll('.auth-tab')[0].classList.add('active');
        document.getElementById('loginForm').classList.remove('hidden');
    } else {
        document.querySelectorAll('.auth-tab')[1].classList.add('active');
        document.getElementById('registerForm').classList.remove('hidden');
    }
}

function login() {
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    const err = document.getElementById('loginError');
    const usuarios = getUsuarios();
    if (!u || !p) { err.textContent = 'Completa todos los campos.'; return; }
    if (!usuarios[u] || usuarios[u] !== p) { err.textContent = 'Usuario o contraseña incorrectos.'; return; }
    err.textContent = '';
    iniciarSesion(u);
}

function register() {
    const u = document.getElementById('regUser').value.trim();
    const p = document.getElementById('regPass').value;
    const p2 = document.getElementById('regPass2').value;
    const err = document.getElementById('regError');
    if (!u || !p || !p2) { err.textContent = 'Completa todos los campos.'; return; }
    if (p !== p2) { err.textContent = 'Las contraseñas no coinciden.'; return; }
    if (p.length < 4) { err.textContent = 'La contraseña debe tener al menos 4 caracteres.'; return; }
    const usuarios = getUsuarios();
    if (usuarios[u]) { err.textContent = 'Ese usuario ya existe.'; return; }
    usuarios[u] = p;
    saveUsuarios(usuarios);
    err.textContent = '';
    toast('¡Cuenta creada! Ya puedes iniciar sesión.', 'success');
    switchAuthTab('login');
    document.getElementById('loginUser').value = u;
}

function iniciarSesion(user) {
    usuarioActual = user;
    storage('tf_session', user);
    tareas = getTareasUsuario();
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    const av = document.getElementById('sidebarAvatar');
    av.textContent = user.charAt(0).toUpperCase();
    document.getElementById('sidebarUser').textContent = user;
    actualizarFecha();
    renderNavCategorias();
    renderCategoriaSelect();
    renderTareas();
    cargarApiKey();
    cargarPreferenciaSonidoNotificacion();
    actualizarContadores();
    registrarComportamiento('login');
    setTimeout(verificarAlarmas, 500);
    inicializarCalendarioDraggable();
    setTimeout(() => {
        mostrarBienvenida();
        generarSugerencias();
        actualizarCoach();
    }, 500);
}

function logout() {
    storage('tf_session', null);
    usuarioActual = null;
    tareas = [];
    filtroCategoria = 'todas';
    filtroEstado = 'todas';

    // Limpiar estado del coach en memoria para que no aparezca
    // el nombre ni historial de la cuenta anterior al iniciar nueva sesión
    _coachHistorial = [];
    _coachIniciado  = false;
    _coachContexto  = {};
    _coachUltimoSeparador = null;
    sonidoNotificacionSeleccionado = SONIDO_NOTIFICACION_DEFAULT;
    const box = document.getElementById('coachMensajes');
    if (box) box.innerHTML = '';

    document.getElementById('appScreen').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
}

function actualizarFecha() {
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const hoy = new Date().toLocaleDateString('es-ES', opciones);
    document.getElementById('pageDate').textContent = hoy.charAt(0).toUpperCase() + hoy.slice(1);
}

// ══════════════════════════════════════════════
// TAREAS — CRUD
// ══════════════════════════════════════════════

function registrarAccion() {
    if (usuarioActual) {
        storage('tf_ultima_accion_' + usuarioActual, new Date().toISOString());
    }
}

// ── Helper compartido post-modificación de tareas ──
function _postTaskUpdate() {
    generarSugerencias();
}

function agregarTarea() {
    const input = document.getElementById('tareaInput');
    const texto = input.value.trim();
    if (!texto) { toast('Escribe una tarea primero.', 'error'); return; }
    const tarea = {
        id: Date.now(),
        texto,
        prioridad: document.getElementById('prioridadSelect').value,
        energia:   document.getElementById('energiaSelect')?.value || 'normal',
        categoria: document.getElementById('categoriaSelect').value,
        fecha: document.getElementById('fechaInput').value,
        completada: false,
        creadaEn: new Date().toISOString(),
        alarma: null,
        alarmaActiva: false,
        alarmaSonido: true,
        alarmaDisparada: false,
        descripcion: '',
        subtareas: [],
        tiempoEstimado: null,
        tiempoReal: null
    };
    tareas.unshift(tarea);
    saveTareas();
    input.value = '';
    document.getElementById('fechaInput').value = '';
    renderTareas();
    actualizarContadores();
    toast('Tarea agregada ✓', 'success');
    input.focus();
    registrarAccion();
    registrarComportamiento('crear', tarea.categoria);
    _postTaskUpdate();
    // Sugerir tiempo estimado en segundo plano (no bloquea)
    setTimeout(() => sugerirTiempoEstimado(tarea.id), 1500);
}

function toggleCompletada(id) {
    const t = tareas.find(x => x.id === id);
    if (!t) return;
    t.completada = !t.completada;
    if (t.completada) t.completadaEn = new Date().toISOString();
    else delete t.completadaEn;
    saveTareas();
    renderTareas();
    actualizarContadores();
    toast(t.completada ? '¡Tarea completada! 🎉' : 'Tarea reabierta', t.completada ? 'success' : '');
    registrarAccion();
    if (t.completada) registrarComportamiento('completar');
    _postTaskUpdate();
}

function eliminarTarea(id) {
    pedirConfirmacion('una', () => {
        tareas = tareas.filter(x => x.id !== id);
        saveTareas();
        renderTareas();
        actualizarContadores();
        toast('Tarea eliminada.', '');
        registrarAccion();
        _postTaskUpdate();
    });
}

function iniciarEdicion(id, spanEl) {
    if (document.querySelector('.edit-input')) return;
    const t = tareas.find(x => x.id === id);
    if (!t) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = t.texto;
    input.classList.add('edit-input');
    spanEl.parentElement.insertAdjacentElement('afterend', input);
    input.focus();
    input.select();
    const guardar = () => {
        const nuevo = input.value.trim();
        if (nuevo) { t.texto = nuevo; saveTareas(); }
        renderTareas();
        actualizarContadores();
    };
    input.addEventListener('keypress', e => { if (e.key === 'Enter') guardar(); });
    input.addEventListener('blur', guardar);
}

function borrarTodas() {
    const visibles = tareasVisibles();
    const ids = visibles.map(t => t.id);
    tareas = tareas.filter(t => !ids.includes(t.id));
    saveTareas();
    renderTareas();
    actualizarContadores();
    toast('Lista limpiada.', '');
    _postTaskUpdate();
}

// ══════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════

function tareasVisibles() {
    let lista = [...tareas];
    if (filtroCategoria !== 'todas') lista = lista.filter(t => t.categoria === filtroCategoria);
    if (filtroEstado === 'pendientes') lista = lista.filter(t => !t.completada);
    if (filtroEstado === 'completadas') lista = lista.filter(t => t.completada);
    const q = document.getElementById('buscador')?.value.toLowerCase().trim();
    if (q) lista = lista.filter(t => t.texto.toLowerCase().includes(q));
    const orden = document.getElementById('ordenSelect')?.value || 'fecha-creacion';
    if (orden === 'prioridad') {
        const p = { alta: 0, media: 1, baja: 2 };
        lista.sort((a, b) => p[a.prioridad] - p[b.prioridad]);
    } else if (orden === 'fecha-limite') {
        lista.sort((a, b) => {
            if (!a.fecha) return 1;
            if (!b.fecha) return -1;
            return a.fecha.localeCompare(b.fecha);
        });
    } else if (orden === 'nombre') {
        lista.sort((a, b) => a.texto.localeCompare(b.texto));
    }
    return lista;
}

function closeTaskActionMenus(exceptTaskId = null) {
    document.querySelectorAll('.task-menu-wrap.open').forEach(menu => {
        if (exceptTaskId && menu.dataset.taskId === String(exceptTaskId)) return;
        menu.classList.remove('open');
        const trigger = menu.querySelector('.task-menu-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
}

function toggleTaskMenu(taskId, triggerEl) {
    const wrap = triggerEl.closest('.task-menu-wrap');
    if (!wrap) return;
    const willOpen = !wrap.classList.contains('open');
    closeTaskActionMenus();
    wrap.classList.toggle('open', willOpen);
    triggerEl.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function agregarSubtareaPrompt(tareaId) {
    const texto = prompt('Nueva subtarea:');
    if (!texto || !texto.trim()) return;
    const t = tareas.find(x => x.id === tareaId);
    if (!t) return;
    if (!t.subtareas) t.subtareas = [];
    t.subtareas.push({ texto: texto.trim(), hecha: false });
    saveTareas();
    renderTareas();
    toast('Subtarea agregada ✓', 'success');
}

function renderTareas() {
    const ul = document.getElementById('listaTareas');
    const vacio = document.getElementById('mensajeVacio');
    const lista = tareasVisibles();
    ul.innerHTML = '';
    if (lista.length === 0) { vacio.classList.remove('hidden'); actualizarHero(); return; }
    vacio.classList.add('hidden');
    const hoy = new Date().toISOString().split('T')[0];

    const catIcoMap = {};
    todasLasCategorias().forEach(c => { catIcoMap[c.id] = c.icono; });

    lista.forEach(t => {
        const li = document.createElement('li');
        li.classList.add('task-item', 'prio-' + t.prioridad);
        if (t.completada) li.classList.add('completada');

        const top = document.createElement('div');
        top.classList.add('task-row-top');

        const check = document.createElement('button');
        check.classList.add('task-check');
        check.innerHTML = t.completada ? '✓' : '';
        check.title = t.completada ? 'Reabrir' : 'Completar';
        check.onclick = () => toggleCompletada(t.id);

        const content = document.createElement('div');
        content.classList.add('task-main-content');

        const span = document.createElement('span');
        span.classList.add('task-text');
        span.textContent = t.texto;
        span.onclick = () => iniciarEdicion(t.id, span);

        const quickMeta = document.createElement('div');
        quickMeta.classList.add('task-quick-meta');
        const catIco = catIcoMap[t.categoria] || '🏷️';
        const catObj = todasLasCategorias().find(c => c.id === t.categoria);
        const catNombre = catObj ? catObj.nombre : (t.categoria.charAt(0).toUpperCase() + t.categoria.slice(1));
        quickMeta.textContent = catIco + ' ' + catNombre;
        if (t.fecha) {
            const vencida = t.fecha < hoy && !t.completada;
            quickMeta.textContent += ' · ' + (vencida ? 'Vence: ' : 'Fecha: ') + formatearFecha(t.fecha);
        }

        content.append(span, quickMeta);

        const menuWrap = document.createElement('div');
        menuWrap.classList.add('task-menu-wrap');
        menuWrap.dataset.taskId = String(t.id);

        const menuTrigger = document.createElement('button');
        menuTrigger.classList.add('btn-ico', 'task-menu-trigger');
        menuTrigger.type = 'button';
        menuTrigger.innerHTML = '⋯';
        menuTrigger.title = 'Más acciones';
        menuTrigger.setAttribute('aria-expanded', 'false');
        menuTrigger.onclick = (e) => {
            e.stopPropagation();
            toggleTaskMenu(t.id, menuTrigger);
        };

        const menu = document.createElement('div');
        menu.classList.add('task-action-menu');

        const createMenuBtn = (txt, cb, cls = '', icono = 'circle') => {
            const btn = document.createElement('button');
            btn.className = 'task-menu-item' + (cls ? ' ' + cls : '');
            btn.type = 'button';
            btn.innerHTML = `<i data-lucide="${icono}"></i><span>${txt}</span>`;
            btn.onclick = () => {
                closeTaskActionMenus();
                cb();
            };
            return btn;
        };

        const btnAlarmText = t.alarmaActiva ? 'Editar recordatorio' : 'Agregar recordatorio';

        menu.append(
            createMenuBtn('Editar título', () => iniciarEdicion(t.id, span), '', 'pencil'),
            createMenuBtn(t.descripcion ? 'Editar descripción' : 'Agregar descripción', () => abrirDescModal(t.id), '', 'file-text'),
            createMenuBtn(btnAlarmText, () => abrirModalAlarma(t.id), '', 'bell'),
            createMenuBtn('Generar subtareas IA', () => generarSubtareasIA(t.id), '', 'wand-sparkles'),
            createMenuBtn('Añadir subtarea', () => agregarSubtareaPrompt(t.id), '', 'list-plus'),
            createMenuBtn('Eliminar tarea', () => eliminarTarea(t.id), 'danger', 'trash-2')
        );

        menuWrap.append(menuTrigger, menu);
        top.append(check, content, menuWrap);

        const meta = document.createElement('div');
        meta.classList.add('task-row-meta');

        const tagPrio = document.createElement('span');
        tagPrio.classList.add('tag', 'tag-prio-' + t.prioridad);
        tagPrio.textContent = 'Prioridad ' + t.prioridad.charAt(0).toUpperCase() + t.prioridad.slice(1);

        meta.append(tagPrio);

        if (t.energia && t.energia !== 'normal') {
            const tagEn = document.createElement('span');
            tagEn.classList.add('tag', 'tag-energia-' + t.energia);
            tagEn.textContent = ENERGIA_CONFIG[t.energia]?.label || t.energia;
            meta.appendChild(tagEn);
        }

        if (t.fecha) {
            const vencida = t.fecha < hoy && !t.completada;
            if (vencida) {
                const tagF = document.createElement('span');
                tagF.classList.add('tag', 'tag-date', 'vencida');
                tagF.textContent = 'Venció: ' + formatearFecha(t.fecha);
                meta.appendChild(tagF);
            }
        }

        if (t.alarma && t.alarmaActiva) {
            const tagA = document.createElement('span');
            tagA.classList.add('tag', 'tag-alarm');
            if (t.alarmaDisparada) tagA.classList.add('disparada');
            const dt = new Date(t.alarma);
            tagA.textContent = (t.alarmaDisparada ? 'Silenciada ' : 'Alarma ') + formatearFechaHora(dt);
            tagA.title = 'Clic para editar recordatorio';
            tagA.onclick = () => abrirModalAlarma(t.id);
            meta.appendChild(tagA);
        }

        if (t.tiempoEstimado) {
            const tagT = document.createElement('span');
            tagT.classList.add('tag', 'tag-tiempo');
            tagT.textContent = 'Tiempo: ' + t.tiempoEstimado;
            tagT.title = 'Tiempo estimado por IA. Clic para editar.';
            tagT.style.cursor = 'pointer';
            tagT.onclick = () => editarTiempoEstimado(t.id, tagT);
            meta.appendChild(tagT);
        }

        li.append(top, meta);

        if (t.descripcion && t.descripcion.trim()) {
            const descZona = document.createElement('div');
            descZona.classList.add('task-desc-zona');
            const descTexto = document.createElement('div');
            descTexto.classList.add('task-desc-texto');
            descTexto.textContent = t.descripcion;
            descTexto.title = 'Clic para editar descripción';
            descTexto.onclick = () => abrirDescModal(t.id);
            descZona.appendChild(descTexto);
            li.appendChild(descZona);
        }

        if (t.subtareas && t.subtareas.length > 0) {
            const subZona = document.createElement('div');
            subZona.classList.add('subtareas-zona');

            const subHeader = document.createElement('div');
            subHeader.classList.add('subtareas-header');
            const hechas = t.subtareas.filter(s => s.hecha).length;
            subHeader.innerHTML = `<span class="subtareas-label">Subtareas</span><span class="subtareas-prog">${hechas}/${t.subtareas.length}</span>`;
            subZona.appendChild(subHeader);

            t.subtareas.forEach((sub, idx) => {
                const subRow = document.createElement('div');
                subRow.classList.add('subtarea-row');
                if (sub.hecha) subRow.classList.add('subtarea-hecha');

                const subCheck = document.createElement('button');
                subCheck.classList.add('subtarea-check');
                subCheck.innerHTML = sub.hecha ? '✓' : '';
                subCheck.onclick = () => toggleSubtarea(t.id, idx);

                const subTxt = document.createElement('span');
                subTxt.classList.add('subtarea-txt');
                subTxt.textContent = sub.texto;

                const subDel = document.createElement('button');
                subDel.classList.add('subtarea-del');
                subDel.innerHTML = '✕';
                subDel.title = 'Eliminar subtarea';
                subDel.onclick = () => eliminarSubtarea(t.id, idx);

                subRow.append(subCheck, subTxt, subDel);
                subZona.appendChild(subRow);
            });

            const subAddBtn = document.createElement('button');
            subAddBtn.classList.add('subtarea-add-btn');
            subAddBtn.type = 'button';
            subAddBtn.textContent = '＋ Añadir subtarea';
            subAddBtn.onclick = () => agregarSubtareaPrompt(t.id);
            subZona.appendChild(subAddBtn);

            li.appendChild(subZona);
        }

        ul.appendChild(li);
    });

    if (window.lucide) lucide.createIcons({ nodes: [ul] });
    actualizarHero();
}

// ══════════════════════════════════════════════
// CONTADORES Y FILTROS
// ══════════════════════════════════════════════

const HERO_COLAPSADO_KEY = 'tf_hero_colapsado';

function aplicarEstadoHeroColapsado(colapsado) {
    const hero = document.getElementById('heroFocusEl');
    const btn = document.getElementById('heroToggleBtn');
    if (!hero || !btn) return;

    hero.classList.toggle('is-collapsed', !!colapsado);
    btn.setAttribute('aria-expanded', colapsado ? 'false' : 'true');
    btn.setAttribute('aria-label', colapsado ? 'Expandir resumen' : 'Reducir resumen');
    btn.title = colapsado ? 'Expandir resumen' : 'Reducir resumen';
    btn.innerHTML = colapsado
        ? '<span class="hero-toggle-icon"><i data-lucide="chevron-down"></i></span>'
        : '<span class="hero-toggle-icon"><i data-lucide="chevron-up"></i></span>';

    if (window.lucide) lucide.createIcons({ nodes: [btn] });
}

function toggleHeroCompacto() {
    const hero = document.getElementById('heroFocusEl');
    if (!hero) return;
    const colapsado = !hero.classList.contains('is-collapsed');
    aplicarEstadoHeroColapsado(colapsado);
    localStorage.setItem(HERO_COLAPSADO_KEY, colapsado ? '1' : '0');
}

function actualizarHero() {
    const bar     = document.getElementById('heroProgressBar');
    if (!bar) return;

    const hoy = new Date().toISOString().split('T')[0];

    const pendientes      = tareas.filter(t => !t.completada).length;
    const completadasHoy  = tareas.filter(t =>
        t.completada && t.completadaEn && t.completadaEn.startsWith(hoy)
    ).length;
    const vencidas        = tareas.filter(t => t.fecha && t.fecha < hoy && !t.completada).length;

    // Progreso del día: completadas hoy vs (completadas hoy + pendientes)
    const base = completadasHoy + pendientes;
    const pct  = base > 0 ? Math.round((completadasHoy / base) * 100)
               : tareas.length > 0 ? 100 : 0;

    // Actualizar barra y números
    bar.style.width = pct + '%';
    bar.style.transition = 'width 0.5s cubic-bezier(0.4,0,0.2,1)';
    document.getElementById('heroProgressNum').textContent = pct + '%';
    document.getElementById('heroPendingNum').textContent  = pendientes;
    document.getElementById('heroDoneNum').textContent     = completadasHoy;
    document.getElementById('heroOverdueNum').textContent  = vencidas;

    // Mensaje dinámico según contexto
    const copy = document.getElementById('heroCopy');
    if (tareas.length === 0) {
        copy.textContent = 'Agrega tu primera tarea y empieza a avanzar.';
    } else if (pct === 100 && completadasHoy > 0) {
        copy.textContent = '¡Increíble! Terminaste todo lo pendiente de hoy. 🎉';
    } else if (vencidas > 0 && completadasHoy === 0) {
        copy.textContent = `Tienes ${vencidas} tarea${vencidas > 1 ? 's' : ''} vencida${vencidas > 1 ? 's' : ''}. Empieza por ahí.`;
    } else if (vencidas > 0) {
        copy.textContent = `${completadasHoy} lista${completadasHoy > 1 ? 's' : ''} hoy, pero aún hay ${vencidas} vencida${vencidas > 1 ? 's' : ''}. Sigue.`;
    } else if (completadasHoy === 0) {
        copy.textContent = 'Organiza el día en bloques cortos y completa una tarea clave primero.';
    } else if (pct >= 75) {
        copy.textContent = `¡Casi listo! ${completadasHoy} completada${completadasHoy > 1 ? 's' : ''} hoy. Ya casi.`;
    } else if (pct >= 50) {
        copy.textContent = `Vas a la mitad. ${completadasHoy} completada${completadasHoy > 1 ? 's' : ''} hoy. Sigue el ritmo.`;
    } else {
        copy.textContent = `${completadasHoy} completada${completadasHoy > 1 ? 's' : ''} hoy. Cada una cuenta.`;
    }
}

function actualizarContadores() {
    const hoy = new Date().toISOString().split('T')[0];
    const completadasHoy = tareas.filter(t => {
        if (!t.completada || !t.completadaEn) return false;
        return t.completadaEn.startsWith(hoy);
    }).length;
    const vencidas = tareas.filter(t => t.fecha && t.fecha < hoy && !t.completada).length;
    const pendientes = tareas.filter(t => !t.completada).length;

    document.getElementById('statTotalNum').textContent = tareas.length;
    document.getElementById('statDoneNum').textContent = completadasHoy;
    document.getElementById('statOverdueNum').textContent = vencidas;
    document.getElementById('statPendingNum').textContent = pendientes;

    renderNavCategorias();
}

function filtrarCategoria(cat) {
    filtroCategoria = cat;
    filtroEstado = 'todas';
    renderNavCategorias();
    document.querySelectorAll('.nav-item[data-estado]').forEach(b => b.classList.remove('active'));
    const catObj = todasLasCategorias().find(c => c.id === cat);
    const titulos = { todas: 'Todas las tareas' };
    document.getElementById('pageTitle').textContent =
        titulos[cat] || (catObj ? catObj.nombre : cat.charAt(0).toUpperCase() + cat.slice(1));
    renderTareas();
}

function filtrarEstado(estado) {
    filtroEstado = estado;
    filtroCategoria = 'todas';
    renderNavCategorias();
    document.querySelectorAll('.nav-item[data-estado]').forEach(b => b.classList.toggle('active', b.dataset.estado === estado));
    const titulos = { pendientes: 'Tareas pendientes', completadas: 'Completadas' };
    document.getElementById('pageTitle').textContent = titulos[estado] || estado;
    renderTareas();
}

function buscarTareas() { renderTareas(); }

/* ── Toggle del panel de opciones avanzadas (móvil) ── */
function toggleTaskExtras(btn) {
    const panel = document.getElementById('addTaskPanelEl');
    const open  = panel.classList.toggle('extras-open');
    btn.setAttribute('aria-expanded', open);
}

function cerrarTooltipsEducativos(exceptId = null) {
    document.querySelectorAll('.help-tooltip').forEach((tooltip) => {
        if (exceptId && tooltip.id === exceptId) return;
        tooltip.classList.remove('is-visible');
        tooltip.dataset.pinned = 'false';
    });

    document.querySelectorAll('.js-tooltip-trigger').forEach((trigger) => {
        const targetId = trigger.getAttribute('data-tooltip-target');
        if (exceptId && targetId === exceptId) return;
        trigger.setAttribute('aria-expanded', 'false');
    });
}

function abrirTooltipEducativo(trigger, pinned = false) {
    if (!trigger) return null;

    const targetId = trigger.getAttribute('data-tooltip-target');
    if (!targetId) return null;

    const tooltip = document.getElementById(targetId);
    if (!tooltip) return null;

    cerrarTooltipsEducativos(targetId);
    tooltip.classList.add('is-visible');
    tooltip.dataset.pinned = pinned ? 'true' : 'false';
    trigger.setAttribute('aria-expanded', 'true');

    return tooltip;
}

function toggleTooltipEducativo(trigger) {
    if (!trigger) return;

    const targetId = trigger.getAttribute('data-tooltip-target');
    if (!targetId) return;

    const tooltip = document.getElementById(targetId);
    if (!tooltip) return;

    const isPinned = tooltip.dataset.pinned === 'true';
    const isVisible = tooltip.classList.contains('is-visible');

    if (isVisible && isPinned) {
        cerrarTooltipsEducativos();
        return;
    }

    abrirTooltipEducativo(trigger, true);
}

function initTooltipsEducativos() {
    document.querySelectorAll('.js-tooltip-trigger').forEach((trigger) => {
        const targetId = trigger.getAttribute('data-tooltip-target');
        if (!targetId) return;

        const tooltip = document.getElementById(targetId);
        if (!tooltip) return;

        trigger.setAttribute('aria-controls', targetId);

        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTooltipEducativo(trigger);
        });

        trigger.addEventListener('mouseenter', () => {
            abrirTooltipEducativo(trigger, false);
        });

        trigger.addEventListener('mouseleave', (e) => {
            if (tooltip.dataset.pinned === 'true') return;
            if (e.relatedTarget && tooltip.contains(e.relatedTarget)) return;
            cerrarTooltipsEducativos();
        });

        tooltip.addEventListener('mouseleave', (e) => {
            if (tooltip.dataset.pinned === 'true') return;
            if (e.relatedTarget && trigger.contains(e.relatedTarget)) return;
            cerrarTooltipsEducativos();
        });
    });
}

// ══════════════════════════════════════════════
// UTILIDADES UI
// ══════════════════════════════════════════════

function pedirConfirmacion(tipo, callback) {
    const overlay = document.getElementById('overlayConfirmacion');
    const texto = document.getElementById('textoConfirmacion');
    if (tipo === 'todas') {
        texto.textContent = '¿Borrar TODAS las tareas visibles? Esta acción no se puede deshacer.';
        accionPendiente = borrarTodas;
    } else {
        texto.textContent = '¿Eliminar esta tarea?';
        accionPendiente = callback;
    }
    overlay.classList.add('activo');
}

function confirmarAccion(si) {
    document.getElementById('overlayConfirmacion').classList.remove('activo');
    if (si && accionPendiente) accionPendiente();
    accionPendiente = null;
}

function formatearFecha(iso) {
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
}

function toggleTema() {
    const html = document.documentElement;
    const dark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', dark ? 'light' : 'dark');
    const themeIcon = document.getElementById('themeIcon');
    themeIcon.innerHTML = dark ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
    lucide.createIcons({ nodes: [themeIcon] });
    storage('tf_tema', dark ? 'light' : 'dark');
}

function toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    const main = document.querySelector('.main-content');
    sidebarAbierto = !sidebarAbierto;
    if (window.innerWidth > 640) {
        sb.classList.toggle('closed', !sidebarAbierto);
        main.classList.toggle('full', !sidebarAbierto);
    } else {
        sb.classList.toggle('open', sidebarAbierto);
    }
}

function toast(msg, tipo) {
    const cont = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.classList.add('toast');
    if (tipo) t.classList.add(tipo);
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2500);
}

function formatearFechaHora(dt) {
    const dia = String(dt.getDate()).padStart(2,'0');
    const mes = String(dt.getMonth()+1).padStart(2,'0');
    const h = String(dt.getHours()).padStart(2,'0');
    const m = String(dt.getMinutes()).padStart(2,'0');
    return dia + '/' + mes + ' ' + h + ':' + m;
}

function toggleCalendar() {
    const panel = document.getElementById('calendarPanel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) renderCalendario();
}

function cambiarMes(dir) {
    calMes += dir;
    if (calMes > 11) { calMes = 0; calAnio++; }
    if (calMes < 0) { calMes = 11; calAnio--; }
    renderCalendario();
}

function renderCalendario() {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    document.getElementById('calTitle').textContent = meses[calMes] + ' ' + calAnio;
    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';

    const dias = ['D','L','M','X','J','V','S'];
    dias.forEach(d => {
        const cell = document.createElement('div');
        cell.classList.add('cal-cell', 'header');
        cell.textContent = d;
        grid.appendChild(cell);
    });

    const primerDia = new Date(calAnio, calMes, 1).getDay();
    const totalDias = new Date(calAnio, calMes + 1, 0).getDate();

    const hoy = new Date();
    const hoyStr = hoy.getFullYear() + '-'
        + String(hoy.getMonth() + 1).padStart(2, '0') + '-'
        + String(hoy.getDate()).padStart(2, '0');

    const prevTotal = new Date(calAnio, calMes, 0).getDate();
    for (let i = 0; i < primerDia; i++) {
        const c = document.createElement('div');
        c.classList.add('cal-cell', 'other-month');
        c.textContent = toBoldNum(prevTotal - primerDia + i + 1);
        grid.appendChild(c);
    }

    for (let d = 1; d <= totalDias; d++) {
        const cell = document.createElement('div');
        cell.classList.add('cal-cell');
        cell.textContent = toBoldNum(d);

        const mm = String(calMes + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        const dateStr = calAnio + '-' + mm + '-' + dd;

        if (dateStr === hoyStr) cell.classList.add('today');

        const tConFecha = tareas.filter(t => t.fecha === dateStr);
        if (tConFecha.length > 0) {
            cell.classList.add('has-task');
            cell.title = tConFecha.length + ' tarea(s)';
            cell.onclick = () => mostrarEventosDia(dateStr, tConFecha);
        }
        grid.appendChild(cell);
    }

    const totalCells = primerDia + totalDias;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
        const c = document.createElement('div');
        c.classList.add('cal-cell', 'other-month');
        c.textContent = toBoldNum(i);
        grid.appendChild(c);
    }

    document.getElementById('calEvents').innerHTML = '';
}

function mostrarEventosDia(dateStr, lista) {
    const ev = document.getElementById('calEvents');
    ev.innerHTML = '<strong style="font-size:0.78rem;color:var(--text2)">' + formatearFecha(dateStr) + ':</strong>';
    lista.forEach(t => {
        const p = document.createElement('p');
        p.classList.add('cal-event-item');
        p.textContent = (t.completada ? '✅ ' : '⏳ ') + t.texto;
        ev.appendChild(p);
    });
}

function inicializarCalendarioDraggable() {
    const panel = document.getElementById('calendarPanel');
    if (!panel || panel._draggableInited) return;
    panel._draggableInited = true;

    let isDragging = false;
    let startX, startY;

    function getHandle() {
        return [
            document.getElementById('calDragHandle'),
            panel.querySelector('.cal-header')
        ];
    }

    function onStart(e) {
        const target = e.target;
        const handles = getHandle();
        const isHandle = handles.some(h => h && (h === target || h.contains(target)));
        if (target.tagName === 'BUTTON') return;
        if (!isHandle) return;

        isDragging = true;
        panel.classList.add('is-dragging');

        const rect = panel.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX - rect.left;
        startY = clientY - rect.top;

        panel.style.right  = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left   = rect.left + 'px';
        panel.style.top    = rect.top  + 'px';
        panel.style.transition = 'none';

        e.preventDefault();
    }

    function onMove(e) {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        let newLeft = clientX - startX;
        let newTop  = clientY - startY;

        const maxLeft = window.innerWidth  - panel.offsetWidth  - 8;
        const maxTop  = window.innerHeight - panel.offsetHeight - 8;
        newLeft = Math.max(8, Math.min(newLeft, maxLeft));
        newTop  = Math.max(8, Math.min(newTop,  maxTop));

        panel.style.left = newLeft + 'px';
        panel.style.top  = newTop  + 'px';
        e.preventDefault();
    }

    function onEnd() {
        if (!isDragging) return;
        isDragging = false;
        panel.classList.remove('is-dragging');
        panel.style.transition = '';
    }

    panel.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    panel.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
}


let alarmaIdActual = null;
let alarmaToggleActivo = false;
let alarmaSonidoActivo = true;
let alarmaEnPantalla = null;

const SONIDOS_NOTIFICACION = {
    suave: {
        nombre: 'Suave',
        duracionMs: 2400,
        notas: [
            { freq: 659, inicio: 0.00, dur: 1.05, tipo: 'sine', gain: 0.17 },
            { freq: 784, inicio: 0.60, dur: 0.95, tipo: 'triangle', gain: 0.13 },
            { freq: 988, inicio: 1.28, dur: 0.82, tipo: 'sine', gain: 0.11 }
        ]
    },
    clasico: {
        nombre: 'Clásico',
        duracionMs: 2150,
        notas: [
            { freq: 784, inicio: 0.00, dur: 0.28, tipo: 'square', gain: 0.15 },
            { freq: 988, inicio: 0.34, dur: 0.28, tipo: 'square', gain: 0.15 },
            { freq: 1175, inicio: 0.68, dur: 0.36, tipo: 'triangle', gain: 0.13 },
            { freq: 988, inicio: 1.18, dur: 0.32, tipo: 'triangle', gain: 0.12 },
            { freq: 784, inicio: 1.58, dur: 0.42, tipo: 'sine', gain: 0.11 }
        ]
    },
    energetico: {
        nombre: 'Energético',
        duracionMs: 2550,
        notas: [
            { freq: 523, inicio: 0.00, dur: 0.28, tipo: 'triangle', gain: 0.16 },
            { freq: 659, inicio: 0.32, dur: 0.28, tipo: 'triangle', gain: 0.16 },
            { freq: 784, inicio: 0.64, dur: 0.34, tipo: 'triangle', gain: 0.15 },
            { freq: 1047,inicio: 1.04, dur: 0.42, tipo: 'sawtooth', gain: 0.11 },
            { freq: 1319,inicio: 1.58, dur: 0.56, tipo: 'sine', gain: 0.10 }
        ]
    }
};

const SONIDO_NOTIFICACION_DEFAULT = 'suave';
let sonidoNotificacionSeleccionado = SONIDO_NOTIFICACION_DEFAULT;
let _audioCtxNotificaciones = null;

function _getStorageKeySonidoNotificacion() {
    return usuarioActual ? 'tf_sound_pref_' + usuarioActual : 'tf_sound_pref_global';
}

function cargarPreferenciaSonidoNotificacion() {
    const guardado = localStorage.getItem(_getStorageKeySonidoNotificacion());
    const valido = guardado && SONIDOS_NOTIFICACION[guardado];
    sonidoNotificacionSeleccionado = valido ? guardado : SONIDO_NOTIFICACION_DEFAULT;
    refrescarSelectorSonidoNotificacion();
}

function guardarPreferenciaSonidoNotificacion() {
    localStorage.setItem(_getStorageKeySonidoNotificacion(), sonidoNotificacionSeleccionado);
}

function refrescarSelectorSonidoNotificacion() {
    const radios = document.querySelectorAll('input[name="notifSound"]');
    radios.forEach(radio => {
        const checked = radio.value === sonidoNotificacionSeleccionado;
        radio.checked = checked;
        radio.closest('.config-sound-option')?.classList.toggle('selected', checked);
    });
}

function seleccionarSonidoNotificacion(idSonido) {
    if (!SONIDOS_NOTIFICACION[idSonido]) return;
    sonidoNotificacionSeleccionado = idSonido;
    guardarPreferenciaSonidoNotificacion();
    refrescarSelectorSonidoNotificacion();
}

function previsualizarSonidoNotificacion(idSonido, event) {
    event?.preventDefault();
    event?.stopPropagation();

    if (!SONIDOS_NOTIFICACION[idSonido]) return;
    seleccionarSonidoNotificacion(idSonido);

    const btn = event?.currentTarget;
    const textoOriginal = btn ? btn.textContent : '';
    if (btn) {
        btn.classList.add('playing');
        btn.textContent = 'Reproduciendo...';
    }

    const duracion = reproducirSonidoNotificacion(idSonido);
    setTimeout(() => {
        if (!btn) return;
        btn.classList.remove('playing');
        btn.textContent = textoOriginal || 'Previsualizar';
    }, duracion + 120);
}

function abrirModalAlarma(id) {
    const t = tareas.find(x => x.id === id);
    if (!t) return;
    alarmaIdActual = id;
    alarmaToggleActivo = t.alarma ? t.alarmaActiva : true;
    alarmaSonidoActivo = t.alarmaSonido !== false;
    document.getElementById('alarmModalTaskName').textContent = t.texto;
    const inp = document.getElementById('alarmDateInput');
    if (t.alarma) {
        const dt = new Date(t.alarma);
        const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0,16);
        inp.value = local;
    } else {
        const ahora = new Date(Date.now() + 5 * 60000);
        const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0,16);
        inp.value = local;
    }
    actualizarToggleModal();
    actualizarSonidoModal();
    actualizarHintModal();
    document.getElementById('alarmModalOverlay').classList.add('activo');
}

function cerrarModalAlarma() {
    document.getElementById('alarmModalOverlay').classList.remove('activo');
    alarmaIdActual = null;
}

function toggleAlarmaBtnModal() {
    alarmaToggleActivo = !alarmaToggleActivo;
    actualizarToggleModal();
    actualizarHintModal();
}

function toggleSonidoModal() {
    alarmaSonidoActivo = !alarmaSonidoActivo;
    actualizarSonidoModal();
}

function actualizarToggleModal() {
    document.getElementById('alarmToggleBtn').classList.toggle('activo', alarmaToggleActivo);
}

function actualizarSonidoModal() {
    document.getElementById('alarmSoundBtn').classList.toggle('activo', alarmaSonidoActivo);
}

function actualizarHintModal() {
    document.getElementById('alarmHint').textContent = alarmaToggleActivo
        ? 'El recordatorio sonará en el momento indicado.'
        : 'El recordatorio está desactivado.';
}

function guardarAlarma() {
    const t = tareas.find(x => x.id === alarmaIdActual);
    if (!t) return;
    const val = document.getElementById('alarmDateInput').value;
    if (!val && alarmaToggleActivo) { toast('Selecciona fecha y hora.', 'error'); return; }
    if (val) {
        const dt = new Date(val);
        if (alarmaToggleActivo && dt <= new Date()) { toast('La hora debe ser en el futuro.', 'error'); return; }
        t.alarma = dt.toISOString();
    }
    t.alarmaActiva = alarmaToggleActivo;
    t.alarmaSonido = alarmaSonidoActivo;
    t.alarmaDisparada = false;
    saveTareas();
    cerrarModalAlarma();
    renderTareas();
    toast(t.alarmaActiva ? '🔔 Recordatorio guardado' : 'Recordatorio desactivado', t.alarmaActiva ? 'success' : '');
}

function reproducirSonidoNotificacion(idSonido = sonidoNotificacionSeleccionado) {
    const preset = SONIDOS_NOTIFICACION[idSonido] || SONIDOS_NOTIFICACION[SONIDO_NOTIFICACION_DEFAULT];
    if (!preset) return 0;

    try {
        if (!_audioCtxNotificaciones) {
            _audioCtxNotificaciones = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (_audioCtxNotificaciones.state === 'suspended') {
            _audioCtxNotificaciones.resume();
        }

        const ctx = _audioCtxNotificaciones;
        const base = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.72, base);
        master.connect(ctx.destination);

        preset.notas.forEach(nota => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = nota.tipo || 'sine';
            osc.frequency.setValueAtTime(nota.freq, base + nota.inicio);

            gain.gain.setValueAtTime(0.0001, base + nota.inicio);
            gain.gain.exponentialRampToValueAtTime(nota.gain || 0.14, base + nota.inicio + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.0001, base + nota.inicio + nota.dur);

            osc.connect(gain);
            gain.connect(master);

            osc.start(base + nota.inicio);
            osc.stop(base + nota.inicio + nota.dur + 0.05);
        });

        return preset.duracionMs || 2000;
    } catch (e) {
        return 0;
    }
}

function reproducirSonidoAlarma() {
    return reproducirSonidoNotificacion(sonidoNotificacionSeleccionado);
}

function mostrarAlertaAlarma(tarea) {
    alarmaEnPantalla = tarea;
    document.getElementById('alertaDesc').textContent = tarea.texto;
    const dt = new Date(tarea.alarma);
    document.getElementById('alertaHora').textContent = 'Programado: ' + formatearFechaHora(dt);
    document.getElementById('alertaAlarma').classList.add('visible');
    if (tarea.alarmaSonido !== false) reproducirSonidoAlarma();
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🔔 Gestask AI — Recordatorio', { body: tarea.texto });
    }
}

function cerrarAlerta() {
    document.getElementById('alertaAlarma').classList.remove('visible');
    alarmaEnPantalla = null;
}

function snoozeAlarma() {
    if (!alarmaEnPantalla) return;
    const t = tareas.find(x => x.id === alarmaEnPantalla.id);
    if (t) {
        t.alarma = new Date(Date.now() + 5 * 60000).toISOString();
        t.alarmaDisparada = false;
        saveTareas();
        renderTareas();
        toast('Recordatorio pospuesto 5 minutos.', '');
    }
    cerrarAlerta();
}

function verificarAlarmas() {
    if (!usuarioActual) return;
    const ahora = Date.now();
    let cambio = false;
    tareas.forEach(t => {
        if (!t.alarma || !t.alarmaActiva || t.alarmaDisparada || t.completada) return;
        if (new Date(t.alarma).getTime() <= ahora) {
            t.alarmaDisparada = true;
            cambio = true;
            mostrarAlertaAlarma(t);
        }
    });
    if (cambio) { saveTareas(); renderTareas(); }
}


// ══════════════════════════════════════════════
// SUBTAREAS — CRUD
// ══════════════════════════════════════════════

function toggleSubtarea(tareaId, idx) {
    const t = tareas.find(x => x.id === tareaId);
    if (!t || !t.subtareas) return;
    t.subtareas[idx].hecha = !t.subtareas[idx].hecha;
    saveTareas();
    renderTareas();
}

function eliminarSubtarea(tareaId, idx) {
    const t = tareas.find(x => x.id === tareaId);
    if (!t || !t.subtareas) return;
    t.subtareas.splice(idx, 1);
    saveTareas();
    renderTareas();
}

function agregarSubtareaManual(tareaId, inputEl) {
    const texto = inputEl.value.trim();
    if (!texto) return;
    const t = tareas.find(x => x.id === tareaId);
    if (!t) return;
    if (!t.subtareas) t.subtareas = [];
    t.subtareas.push({ texto, hecha: false });
    saveTareas();
    renderTareas();
}

async function generarSubtareasIA(tareaId) {
    const t = tareas.find(x => x.id === tareaId);
    if (!t) return;

    const API_KEY = localStorage.getItem('tf_gemini_key') || '';
    if (!API_KEY) {
        toast('⚠️ Necesitas una API Key de Groq en Configuración ⚙️', 'error');
        return;
    }

    toast('🪄 Generando subtareas…', '');

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_KEY
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                max_tokens: 300,
                messages: [
                    {
                        role: 'system',
                        content: 'Eres un asistente de productividad. Responde ÚNICAMENTE con un JSON puro (sin markdown ni backticks) con la forma: {"subtareas":["texto1","texto2","texto3"]}. Genera entre 3 y 5 subtareas concretas y accionables.'
                    },
                    {
                        role: 'user',
                        content: `Descompón esta tarea en subtareas concretas: "${t.texto}"`
                    }
                ]
            })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        let raw = data.choices?.[0]?.message?.content || '';
        // Limpiar posibles backticks
        raw = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        const lista = parsed.subtareas || [];

        if (!lista.length) throw new Error('Sin resultados');

        if (!t.subtareas) t.subtareas = [];
        lista.forEach(s => t.subtareas.push({ texto: s, hecha: false }));
        saveTareas();
        renderTareas();
        toast('✓ ' + lista.length + ' subtareas agregadas', 'success');

        // Registro de tiempo estimado si no tiene
        if (!t.tiempoEstimado) sugerirTiempoEstimado(tareaId);

    } catch (err) {
        toast('Error generando subtareas: ' + err.message, 'error');
    }
}

// ══════════════════════════════════════════════
// ESTIMACIÓN DE TIEMPO — campo y sugerencia IA
// ══════════════════════════════════════════════

async function sugerirTiempoEstimado(tareaId) {
    const t = tareas.find(x => x.id === tareaId);
    if (!t) return;
    const API_KEY = localStorage.getItem('tf_gemini_key') || '';
    if (!API_KEY) return;

    // Historial de tiempos del usuario para personalizar
    const perfil = getPerfil();
    const histTiempos = perfil.historialTiempos ? JSON.stringify(perfil.historialTiempos).slice(0, 200) : 'sin datos';

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_KEY
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                max_tokens: 60,
                messages: [
                    {
                        role: 'system',
                        content: 'Eres un asistente de productividad. Responde SOLO con JSON puro sin markdown: {"estimacion":"X min"} o {"estimacion":"X h"}. Sé realista.'
                    },
                    {
                        role: 'user',
                        content: `¿Cuánto tiempo tomará esta tarea? "${t.texto}"${t.subtareas?.length ? ' con ' + t.subtareas.length + ' subtareas' : ''}. Historial del usuario: ${histTiempos}`
                    }
                ]
            })
        });

        const data = await res.json();
        let raw = data.choices?.[0]?.message?.content || '';
        raw = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        if (parsed.estimacion) {
            t.tiempoEstimado = parsed.estimacion;
            saveTareas();
            renderTareas();
        }
    } catch (e) { /* silencioso */ }
}

function editarTiempoEstimado(tareaId, tagEl) {
    const t = tareas.find(x => x.id === tareaId);
    if (!t) return;
    const nuevo = prompt('Tiempo estimado (ej: 30 min, 1 h):', t.tiempoEstimado || '');
    if (nuevo !== null) {
        t.tiempoEstimado = nuevo.trim() || null;
        saveTareas();
        renderTareas();
    }
}

function registrarTiempoReal(tareaId, minutos) {
    const t = tareas.find(x => x.id === tareaId);
    if (!t) return;
    t.tiempoReal = minutos;
    // Guardar en perfil para aprendizaje
    const perfil = getPerfil();
    if (!perfil.historialTiempos) perfil.historialTiempos = [];
    perfil.historialTiempos.push({ texto: t.texto, minutos, estimado: t.tiempoEstimado });
    if (perfil.historialTiempos.length > 20) perfil.historialTiempos.splice(0, 1);
    savePerfil(perfil);
    saveTareas();
}

// ══════════════════════════════════════════════
// COACH IA
// ══════════════════════════════════════════════

let _coachHistorial = [];  // { rol: 'user'|'ia', texto: string }
let _coachIniciado  = false;
let _coachEsperando = false;
let _coachContexto  = {};
let _coachUltimoSeparador = null;

// ── Tonos del coach ──
const COACH_TONOS = {
    directo:    'Sé muy directo y conciso. Ve al punto. Sin rodeos ni elogios innecesarios.',
    motivador:  'Sé motivador y entusiasta. Celebra los logros aunque sean pequeños. Usa emojis con moderación.',
    estrategico:'Sé estratégico. Analiza la situación, prioriza y da pasos concretos numerados.'
};

function _getTono() {
    const sel = document.getElementById('coachToneSelect');
    return COACH_TONOS[sel ? sel.value : 'directo'] || COACH_TONOS.directo;
}

function _buildCoachContexto() {
    const hoy = new Date().toISOString().split('T')[0];
    const hora = new Date().getHours();
    const pendientes     = tareas.filter(t => !t.completada);
    const completadasHoy = tareas.filter(t => t.completada && t.completadaEn && t.completadaEn.startsWith(hoy));
    const altasPend      = pendientes.filter(t => t.prioridad === 'alta');
    const vencidas       = tareas.filter(t => t.fecha && t.fecha < hoy && !t.completada);

    let energia = 'normal';
    if (hora >= 6 && hora < 10) energia = 'mañana temprano';
    else if (hora >= 10 && hora < 14) energia = 'media mañana';
    else if (hora >= 14 && hora < 17) energia = 'tarde';
    else if (hora >= 17 && hora < 21) energia = 'noche';
    else energia = 'madrugada';

    const resumenTareas = tareas.slice(0, 8).map(t =>
        `- [${t.completada ? 'HECHA' : 'PENDIENTE'}] ${t.texto} (${t.prioridad}, ${t.categoria}${t.fecha ? ', vence:'+t.fecha : ''})`
    ).join('\n') || 'Sin tareas aún.';

    return {
        texto: `HOY: ${hoy} (usar como referencia para calcular días restantes)\nTareas totales: ${tareas.length}\nCompletadas hoy: ${completadasHoy.length}\nPendientes: ${pendientes.length}\nAlta prioridad pendiente: ${altasPend.length}\nVencidas: ${vencidas.length}\nHora del día: ${energia}\nÚltimas tareas:\n${resumenTareas}\n\n${_buildPerfilResumen()}`,
        raw: { pendientes: pendientes.length, completadasHoy: completadasHoy.length, energia }
    };
}

// ── Formatear respuesta IA como tarjetas si hay pasos numerados ──
function _formatearRespuestaIA(texto) {
    const lineas = texto.split('\n');
    const esLista = lineas.filter(l => /^\d+[\.\)]\s+.+/.test(l.trim())).length >= 2;

    if (!esLista) {
        // Respuesta normal: convertir saltos de línea a <br>
        const div = document.createElement('div');
        div.innerHTML = texto.replace(/\n/g, '<br>');
        return div;
    }

    // Renderizar como tarjetas numeradas
    const wrapper = document.createElement('div');
    const intro = [];
    const pasos = [];

    lineas.forEach(linea => {
        const match = linea.trim().match(/^(\d+)[\.\)]\s+(.+)/);
        if (match) {
            pasos.push({ num: match[1], texto: match[2] });
        } else if (linea.trim()) {
            if (pasos.length === 0) intro.push(linea.trim());
        }
    });

    if (intro.length > 0) {
        const p = document.createElement('div');
        p.style.marginBottom = '6px';
        p.innerHTML = intro.join('<br>');
        wrapper.appendChild(p);
    }

    const lista = document.createElement('div');
    lista.classList.add('coach-steps-list');

    pasos.forEach(paso => {
        const card = document.createElement('div');
        card.classList.add('coach-step-card');

        const num = document.createElement('span');
        num.classList.add('coach-step-num');
        num.textContent = paso.num;

        const txt = document.createElement('span');
        txt.classList.add('coach-step-text');
        txt.textContent = paso.texto;

        card.append(num, txt);
        lista.appendChild(card);
    });

    wrapper.appendChild(lista);
    return wrapper;
}

function _formatoSeparadorCoach(fecha = new Date()) {
    return fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function _insertarSeparadorTiempoCoach(force = false) {
    const box = document.getElementById('coachMensajes');
    if (!box) return;

    const ahora = Date.now();
    const intervalo = 1000 * 60 * 20; // cada 20 min de conversación

    if (!force && _coachUltimoSeparador && (ahora - _coachUltimoSeparador) < intervalo) return;

    const sep = document.createElement('div');
    sep.className = 'coach-time-separator';
    sep.textContent = _formatoSeparadorCoach(new Date(ahora));
    box.appendChild(sep);
    _coachUltimoSeparador = ahora;
}

function _getAccionesDinamicasCoach() {
    const h = new Date().getHours();

    if (h >= 6 && h < 12) {
        return [
            { label: 'Plan del día', prompt: 'Ayúdame con mi plan del día en bloques simples.' },
            { label: '🎯 Prioridad clave', prompt: 'Dime cuál debería ser mi prioridad número 1 hoy.' }
        ];
    }

    if (h >= 12 && h < 19) {
        return [
            { label: 'Reenfocar', prompt: 'Necesito reenfocar mi tarde. ¿Qué hago ahora?' },
            { label: '⚡ Sprint corto', prompt: 'Dame un sprint de enfoque para los próximos 30 minutos.' }
        ];
    }

    return [
        { label: 'Cierre del día', prompt: 'Ayúdame a hacer un cierre del día con lo más importante.' },
        { label: '📝 Mañana claro', prompt: 'Déjame listo un mini plan para mañana.' }
    ];
}

function renderAccionesDinamicasCoach() {
    const cont = document.getElementById('coachDynamicActions');
    if (!cont) return;

    cont.innerHTML = '';
    const acciones = _getAccionesDinamicasCoach();

    acciones.forEach(accion => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'coach-quick-btn';
        btn.textContent = accion.label;
        btn.addEventListener('click', () => enviarRapido(accion.prompt));
        cont.appendChild(btn);
    });
}

// ── Agrega un mensaje al chat y al historial ──
function agregarMensajeChat(rol, texto, animar) {
    _coachHistorial.push({ rol, texto });
    // Mantener solo los últimos 20 en historial para memoria
    if (_coachHistorial.length > 20) _coachHistorial.splice(0, _coachHistorial.length - 20);

    const box = document.getElementById('coachMensajes');
    if (!box) return;

    _insertarSeparadorTiempoCoach();

    const div = document.createElement('div');
    div.classList.add('coach-msg', rol === 'user' ? 'coach-msg-user' : 'coach-msg-ia');
    if (animar !== false) div.classList.add('coach-msg-in');

    if (rol === 'ia') {
        div.appendChild(_formatearRespuestaIA(texto));
    } else {
        div.textContent = texto;
    }

    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// ── Mostrar / quitar indicador de escritura ──
function _mostrarTyping() {
    const box = document.getElementById('coachMensajes');
    if (!box || box.querySelector('.coach-typing')) return;
    _insertarSeparadorTiempoCoach();
    const t = document.createElement('div');
    t.classList.add('coach-msg', 'coach-msg-ia', 'coach-typing', 'coach-msg-in');
    t.innerHTML = `
        <span class="coach-typing-text">Mocoa está pensando tu mejor siguiente paso…</span>
        <span class="coach-typing-dots"><span></span><span></span><span></span></span>
    `;
    box.appendChild(t);
    box.scrollTop = box.scrollHeight;
}

function _quitarTyping() {
    const box = document.getElementById('coachMensajes');
    if (!box) return;
    const t = box.querySelector('.coach-typing');
    if (t) t.remove();
}

// ── Limpiar el chat ──
function limpiarChatCoach() {
    _coachHistorial = [];
    _coachIniciado  = false;
    _coachUltimoSeparador = null;
    const box = document.getElementById('coachMensajes');
    if (box) box.innerHTML = '';
    renderAccionesDinamicasCoach();
    actualizarCoach();
}

// ── Guardar / cargar API Key ──
function guardarApiKey() {
    const val = document.getElementById('geminiApiKey')?.value.trim();
    if (val) localStorage.setItem('tf_gemini_key', val);
    else localStorage.removeItem('tf_gemini_key');
}

function cargarApiKey() {
    const key = localStorage.getItem('tf_gemini_key') || '';
    const input = document.getElementById('geminiApiKey');
    if (input && key) input.value = key;
}

function toggleVerApiKey() {
    const input = document.getElementById('geminiApiKey');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    const btn = document.querySelector('.coach-apikey-toggle');
    if (btn) {
        btn.innerHTML = input.type === 'text' ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
        lucide.createIcons({ nodes: [btn] });
    }
}

// ── Llamada a Groq con historial (memoria corta) y tono ──
async function enviarMensajeIA(historial, contexto) {
    const API_KEY = localStorage.getItem('tf_gemini_key') || '';
    if (!API_KEY) throw new Error('sin-key');

    const tono = _getTono();

    // Fecha, hora y zona horaria real del dispositivo del usuario
    const ahora      = new Date();
    const tzName     = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetMin  = -ahora.getTimezoneOffset();
    const offsetStr  = (offsetMin >= 0 ? '+' : '-') +
                       String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0') + ':' +
                       String(Math.abs(offsetMin) % 60).padStart(2, '0');
    const fechaReal  = ahora.toLocaleString('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Calcular fecha ISO de hoy para anclarla explícitamente
    const hoyISO = ahora.toISOString().split('T')[0]; // ej: "2026-04-26"

    const systemPrompt =
        'Eres Mocoa AI, un asistente inteligente dentro de la app Gestask AI. ' +
        'Puedes responder CUALQUIER pregunta del usuario: hora, fecha, zonas horarias, consejos, ' +
        'organización, cultura general, etc. No te limites solo a tareas. ' +

        '══ INFORMACIÓN TEMPORAL EXACTA DEL DISPOSITIVO ══\n' +
        'HOY ES: ' + fechaReal + ' (' + hoyISO + ').\n' +
        'Zona horaria: ' + tzName + ' (UTC' + offsetStr + ').\n' +

        '══ REGLAS DE RAZONAMIENTO DE FECHAS (OBLIGATORIO) ══\n' +
        '1. Antes de proponer cualquier plan o cronograma, razona mentalmente cuántos días quedan desde HOY (' + hoyISO + ') hasta cada fecha de vencimiento.\n' +
        '2. NUNCA sugiere actividades con fecha POSTERIOR a la fecha de vencimiento/entrega de la tarea.\n' +
        '3. Si el plazo es muy corto (1-2 días), el plan debe concentrarse SOLO en esos días disponibles.\n' +
        '4. Verifica que las fechas del plan estén en orden cronológico lógico: las fechas del plan deben ir de menor a mayor y todas deben ser <= fecha de entrega.\n' +
        '5. Si el usuario señala un error de fechas, corrígelo completamente y rehaz el plan desde cero.\n' +

        'Respuestas claras y directas. ' +
        tono +
        '\n\nCONTEXTO DE TAREAS Y PERFIL DEL USUARIO (úsalo solo si es relevante):\n' + contexto;

    // Tomar los últimos 10 mensajes del historial para memoria corta
    const ultimos = historial.slice(-10);
    const mensajes = [
        { role: 'system', content: systemPrompt },
        ...ultimos.map(m => ({
            role: m.rol === 'user' ? 'user' : 'assistant',
            content: m.texto
        }))
    ];

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + API_KEY
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 350,
            messages: mensajes
        })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Error Groq');
    const texto = data.choices?.[0]?.message?.content;
    if (!texto) throw new Error('Respuesta vacía');
    return texto;
}

// ── Botones rápidos ──
function enviarRapido(texto) {
    if (_coachEsperando) return;
    const input = document.getElementById('coachInput');
    if (input) input.value = texto;
    enviarMensajeCoach();
}

// ── Enviar mensaje del usuario ──
async function enviarMensajeCoach() {
    if (_coachEsperando) return;
    const input = document.getElementById('coachInput');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) { input.focus(); return; }

    input.value = '';
    agregarMensajeChat('user', msg);

    _coachEsperando = true;
    _actualizarEstadoInput(true);
    _mostrarTyping();

    _coachContexto = _buildCoachContexto();

    try {
        const respuesta = await enviarMensajeIA(_coachHistorial, _coachContexto.texto);
        _quitarTyping();
        agregarMensajeChat('ia', respuesta);
    } catch (err) {
        _quitarTyping();
        if (err.message === 'sin-key') {
            agregarMensajeChat('ia', '⚠️ Ingresa tu API Key de Groq en el campo de arriba. Regístrate gratis en console.groq.com (sin tarjeta de crédito).');
        } else {
            agregarMensajeChat('ia', '⚠️ Error al conectar: ' + err.message + '\nVerifica que tu API Key sea correcta y esté activa.');
        }
    } finally {
        _coachEsperando = false;
        _actualizarEstadoInput(false);
    }
}

// ── Habilitar / deshabilitar el input mientras espera ──
function _actualizarEstadoInput(desactivar) {
    const input = document.getElementById('coachInput');
    const btn   = document.querySelector('.coach-send-btn');
    if (input) input.disabled = desactivar;
    if (btn)   btn.disabled   = desactivar;
    if (btn)   btn.classList.toggle('loading', desactivar);
}

// ── Saludo automático inicial con resumen diario ──
function actualizarCoach() {
    if (!usuarioActual) return;

    _coachContexto = _buildCoachContexto();

    if (_coachIniciado) return;
    _coachIniciado = true;

    const box = document.getElementById('coachMensajes');
    if (!box) return;

    const hora    = new Date().getHours();
    const hoy     = new Date().toISOString().split('T')[0];
    const ayer    = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const ctx     = _coachContexto.raw;
    const perfil  = getPerfil();

    let saludo = '';
    if (hora >= 5  && hora < 12) saludo = '¡Buenos días';
    else if (hora >= 12 && hora < 18) saludo = '¡Buenas tardes';
    else saludo = '¡Buenas noches';

    // ── Resumen de ayer si existe ─────────────────
    const completadasAyer = tareas.filter(t =>
        t.completada && t.completadaEn && t.completadaEn.startsWith(ayer)
    );
    const pendientesAyer = tareas.filter(t =>
        !t.completada && t.fecha && t.fecha <= ayer
    );

    let resumenAyer = '';
    const ultimaFecha = perfil.ultimaFechaActiva;
    const esNuevoDia  = ultimaFecha && ultimaFecha !== hoy && ultimaFecha === ayer;

    if (esNuevoDia && completadasAyer.length > 0) {
        resumenAyer = `\n📊 Ayer completaste ${completadasAyer.length} tarea(s).`;
        if (pendientesAyer.length > 0)
            resumenAyer += ` Quedaron ${pendientesAyer.length} sin terminar.`;
    }

    // ── Racha ─────────────────────────────────────
    let rachaMsg = '';
    if ((perfil.rachaActual || 0) > 1) {
        rachaMsg = `\n🔥 Llevas ${perfil.rachaActual} días seguidos activo.`;
    }

    // ── Estado del día actual ──────────────────────
    let estado = '';
    if (ctx.pendientes === 0 && tareas.length === 0)
        estado = 'Aún no tienes tareas. ¡Empieza agregando una!';
    else if (ctx.completadasHoy >= 3)
        estado = `Llevas ${ctx.completadasHoy} tareas completadas hoy 🌟`;
    else if (ctx.pendientes > 8)
        estado = `Tienes ${ctx.pendientes} pendientes — mucho para un día. Usa Modo Hoy 🎯`;
    else if (ctx.pendientes > 0)
        estado = `Tienes ${ctx.pendientes} pendiente(s). Te ayudo a priorizarlas.`;
    else
        estado = 'Todo al día por ahora. ¡Buen trabajo!';

    // ── Energía sugerida ─────────────────────────
    const energiaSug = _getEnergiaHora();
    const energiaMsg = `\n${ENERGIA_CONFIG[energiaSug].label} es la energía recomendada para esta hora.`;

    const bienvenida = `${saludo}, ${usuarioActual}! 👋\nSoy Mocoa.${resumenAyer}${rachaMsg}\n${estado}${energiaMsg}\n¿En qué te ayudo hoy?`;
    _insertarSeparadorTiempoCoach(true);
    agregarMensajeChat('ia', bienvenida, false);
}

// ══════════════════════════════════════════════
// SUGERENCIAS AUTOMÁTICAS (panel flotante)
// ══════════════════════════════════════════════

let _sugerenciaTimer = null;

function generarSugerencias() {
    if (!usuarioActual) return;

    const hoy             = new Date().toISOString().split('T')[0];
    const pendientes      = tareas.filter(t => !t.completada);
    const completadasHoy  = tareas.filter(t => t.completada && t.completadaEn && t.completadaEn.startsWith(hoy));
    const altasPendientes = tareas.filter(t => t.prioridad === 'alta' && !t.completada);
    const vencidas        = tareas.filter(t => t.fecha && t.fecha < hoy && !t.completada);
    const perfil          = getPerfil();

    let mensaje = null;
    let accion  = null; // texto del botón CTA opcional

    // ── 1. Sobrecarga ──────────────────────────────
    if (pendientes.length > 8) {
        mensaje = `😵 Tienes ${pendientes.length} tareas pendientes. Eso es demasiado para un solo día — usa Modo Hoy para ver solo lo esencial.`;
        accion  = { texto: '🎯 Abrir Modo Hoy', fn: 'abrirModoHoy()' };

    // ── 2. Procrastinación detectada ───────────────
    } else if ((perfil.visitasHoy || 0) >= 3 && completadasHoy.length === 0 && pendientes.length > 0) {
        mensaje = `🔍 Llevas ${perfil.visitasHoy} visitas hoy sin completar nada. ¿Estás evitando algo? Empieza con la más pequeña.`;
        accion  = { texto: '🎯 Ver Modo Hoy', fn: 'abrirModoHoy()' };

    // ── 3. Vencidas ────────────────────────────────
    } else if (vencidas.length > 0) {
        mensaje = `⚠️ Tienes ${vencidas.length} tarea(s) vencida(s). Atiéndelas o reprograma.`;

    // ── 4. Prioridades altas sin tocar ────────────
    } else if (altasPendientes.length >= 2) {
        mensaje = `⚡ Tienes ${altasPendientes.length} tareas de prioridad ALTA pendientes. ¡Atiéndelas primero!`;

    // ── 5. Sin completar nada aún ─────────────────
    } else if (tareas.length > 0 && completadasHoy.length === 0) {
        mensaje = `⏰ Aún no has completado ninguna tarea hoy. ¡Una pequeña ya es avance!`;

    // ── 6. Racha activa ───────────────────────────
    } else if (completadasHoy.length >= 3) {
        const racha = perfil.rachaActual || 1;
        mensaje = `🌟 ¡${completadasHoy.length} tareas completadas hoy! ${racha > 1 ? 'Llevas ' + racha + ' días seguidos en racha 🔥' : '¡Sigue así!'}`;
    }

    if (_sugerenciaTimer) clearTimeout(_sugerenciaTimer);
    if (!mensaje) { cerrarSugerencia(); return; }

    _sugerenciaTimer = setTimeout(() => {
        document.getElementById('sugerenciasTexto').textContent = mensaje;

        // Botón CTA opcional
        const btnCta = document.getElementById('sugerenciasCta');
        if (btnCta) {
            if (accion) {
                btnCta.textContent  = accion.texto;
                btnCta.setAttribute('onclick', accion.fn);
                btnCta.classList.remove('hidden');
            } else {
                btnCta.classList.add('hidden');
            }
        }

        document.getElementById('sugerenciasPanel').classList.remove('hidden');
        setTimeout(cerrarSugerencia, 11000);
    }, 700);
}

function cerrarSugerencia() {
    document.getElementById('sugerenciasPanel').classList.add('hidden');
    if (_sugerenciaTimer) { clearTimeout(_sugerenciaTimer); _sugerenciaTimer = null; }
}

// ══════════════════════════════════════════════
// MODAL DE BIENVENIDA
// ══════════════════════════════════════════════

function mostrarBienvenida() {
    const key = 'tf_bienvenida_' + usuarioActual;
    if (storage(key)) return;
    storage(key, true);
    document.getElementById('modalBienvenida').classList.add('activo');
}

function cerrarBienvenida() {
    document.getElementById('modalBienvenida').classList.remove('activo');
}

function cerrarBienvenidaIniciarTour() {
    cerrarBienvenida();
    setTimeout(iniciarTour, 300);
}

// ══════════════════════════════════════════════
// TOUR GUIADO
// ══════════════════════════════════════════════

const TOUR_PASOS = [
    {
        elementoId: 'addTaskPanelEl',
        titulo: 'Agregar tarea',
        desc: 'Aquí puedes crear una nueva tarea. Escribe el nombre, elige prioridad, categoría y fecha. Luego presiona "+ Agregar" o Enter.',
        icono: '✏️'
    },
    {
        elementoId: 'listaTareas',
        titulo: 'Lista de tareas',
        desc: 'Aquí aparecen todas tus tareas. Puedes marcarlas, editarlas, agregarles descripción, recordatorio o eliminarlas.',
        icono: '📋'
    },
    {
        elementoId: 'sidebarNav',
        titulo: 'Filtros y categorías',
        desc: 'Organiza tus tareas por categoría (Personal, Trabajo, Estudio) o crea las tuyas propias. Filtra por estado: Pendientes o Completadas.',
        icono: '🗂️'
    },
    {
        elementoId: 'statsBarEl',
        titulo: 'Estadísticas',
        desc: 'De un vistazo ves el total de tareas, cuántas completaste hoy, cuántas están vencidas y cuántas pendientes.',
        icono: '📊'
    },
    {
        elementoId: 'searchWrapEl',
        titulo: 'Búsqueda',
        desc: 'Busca cualquier tarea por nombre en tiempo real. También puedes ordenar por fecha, prioridad o nombre.',
        icono: '🔍'
    },
    {
        elementoId: 'calFabBtn',
        titulo: 'Calendario',
        desc: 'Abre el calendario para ver tus tareas por día. ¡Puedes arrastrarlo libremente por la pantalla!',
        icono: '📅'
    },
    {
        elementoId: 'coachBox',
        titulo: 'Coach IA',
        desc: 'Tu coach de productividad con IA. Hazle preguntas, pide consejos o usa los botones rápidos. Recuerda los últimos mensajes de la conversación.',
        icono: '🤖'
    }
];

let _tourPaso = 0;
let _tourElActivo = null;

// ── Funciones de navegación del tour antiguo (heredado por el Spotlight v2) ──
function tourSiguiente() {
    if (_tourPaso >= TOUR_PASOS.length - 1) {
        cerrarTour();
        toast('¡Recorrido completado! 🎉', 'success');
        return;
    }
    _tourPaso++;
}

function tourAnterior() {
    if (_tourPaso <= 0) return;
    _tourPaso--;
}

let _descIdActual = null;

function abrirDescModal(id) {
    const t = tareas.find(x => x.id === id);
    if (!t) return;
    _descIdActual = id;
    document.getElementById('descModalNombre').textContent = '📌 ' + t.texto;
    document.getElementById('descModalInput').value = t.descripcion || '';
    document.getElementById('descModal').classList.add('activo');
    setTimeout(() => document.getElementById('descModalInput').focus(), 150);
}

function cerrarDescModal() {
    document.getElementById('descModal').classList.remove('activo');
    _descIdActual = null;
}

function guardarDescripcion() {
    const t = tareas.find(x => x.id === _descIdActual);
    if (!t) return;
    const val = document.getElementById('descModalInput').value.trim();
    t.descripcion = val;
    saveTareas();
    cerrarDescModal();
    renderTareas();
    toast(val ? '📝 Descripción guardada' : 'Descripción eliminada', 'success');
}

// ══════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════

(function init() {
    const tema = storage('tf_tema');
    if (tema) {
        document.documentElement.setAttribute('data-theme', tema);
        const themeIcon = document.getElementById('themeIcon');
        themeIcon.innerHTML = tema === 'dark' ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
        lucide.createIcons({ nodes: [themeIcon] });
    }

    const sesion = storage('tf_session');
    if (sesion) {
        const usuarios = getUsuarios();
        if (usuarios[sesion]) iniciarSesion(sesion);
    }

    if (window.innerWidth <= 640) sidebarAbierto = false;

    const heroColapsado = localStorage.getItem(HERO_COLAPSADO_KEY) === '1';
    aplicarEstadoHeroColapsado(heroColapsado);

    setInterval(verificarAlarmas, 15000);

    if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => Notification.requestPermission(), 3000);
    }

    initTooltipsEducativos();

    // ── Un único listener de Escape que cierra cualquier modal abierto ──
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarTour();
            cerrarBienvenida();
            cerrarDescModal();
            cerrarSugerencia();
            cerrarModalAlarma();
            cerrarTooltipsEducativos();
            if (typeof cerrarMocoaModal === 'function') cerrarMocoaModal();
            if (typeof cerrarConfigModal === 'function') cerrarConfigModal();
        }
    });

    document.getElementById('modalBienvenida').addEventListener('click', function(e) {
        if (e.target === this) cerrarBienvenida();
    });
    document.getElementById('descModal').addEventListener('click', function(e) {
        if (e.target === this) cerrarDescModal();
    });
    document.getElementById('alarmModalOverlay').addEventListener('click', function(e) {
        if (e.target === this) cerrarModalAlarma();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.task-menu-wrap')) closeTaskActionMenus();
        if (!e.target.closest('.task-field-group')) cerrarTooltipsEducativos();
    });

    renderAccionesDinamicasCoach();
})();

/* ══ COACH MODO ENFOQUE ══ */
function expandirCoach() {
    const box = document.getElementById('coachBox');
    const btn = document.querySelector('.coach-expand-btn');
    const expandido = box.classList.toggle('expandido');

    btn.title       = expandido ? 'Salir del modo enfoque' : 'Abrir modo enfoque IA';
    btn.setAttribute('aria-label', expandido ? 'Salir del modo enfoque' : 'Abrir modo enfoque IA');
    btn.textContent = expandido ? '✕' : '⛶';

    // Evitar scroll del body cuando está en pantalla completa
    document.body.style.overflow = expandido ? 'hidden' : '';
}

// ══════════════════════════════════════════════
// NUEVAS FUNCIONES UI — refactoring (sin alterar lógica)
// ══════════════════════════════════════════════

/* ── Modal Mocoa AI ── */
function abrirMocoaModal() {
    document.getElementById('mocoaModal').classList.add('activo');
    document.body.style.overflow = 'hidden';
    renderAccionesDinamicasCoach();
    // Inicializar saludo si el chat está vacío
    const msgs = document.getElementById('coachMensajes');
    if (msgs && msgs.children.length === 0) actualizarCoach();
}

function cerrarMocoaModal() {
    document.getElementById('mocoaModal').classList.remove('activo');
    // Si el coach estaba expandido, cerrarlo también
    const box = document.getElementById('coachBox');
    if (box && box.classList.contains('expandido')) box.classList.remove('expandido');
    document.body.style.overflow = '';
}

// Cerrar modales al hacer click fuera del panel (overlay)
// El DOM ya está disponible cuando este script se ejecuta (cargado al final del body)
document.getElementById('mocoaModal')?.addEventListener('click', function (e) {
    if (e.target === this) cerrarMocoaModal();
});
document.getElementById('configModal')?.addEventListener('click', function (e) {
    if (e.target === this) cerrarConfigModal();
});

/* ── Modal Configuración ── */
function abrirConfigModal() {
    // Cargar API Key existente
    cargarApiKey();
    cargarPreferenciaSonidoNotificacion();
    // Cargar nombre de usuario actual
    const input = document.getElementById('configNombreInput');
    if (input && usuarioActual) {
        const nombreGuardado = localStorage.getItem('tf_nombre_' + usuarioActual) || usuarioActual;
        input.value = nombreGuardado;
    }
    document.getElementById('configModal').classList.add('activo');
    document.body.style.overflow = 'hidden';
}

function cerrarConfigModal() {
    document.getElementById('configModal').classList.remove('activo');
    document.body.style.overflow = '';
}

/* ── Guardar nombre de perfil ── */
function guardarPerfil() {
    const input = document.getElementById('configNombreInput');
    const nombre = input?.value.trim();
    if (!nombre) { toast('Escribe un nombre válido.', 'error'); return; }
    if (!usuarioActual) return;
    localStorage.setItem('tf_nombre_' + usuarioActual, nombre);
    // Actualizar el nombre visible en el sidebar
    const sidebarUser = document.getElementById('sidebarUser');
    if (sidebarUser) sidebarUser.textContent = nombre;
    toast('Perfil actualizado ✓', 'success');
    cerrarConfigModal();
}

/* ── Toggle contraseña (login / registro) ── */
function togglePassVisible(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const visible = inp.type === 'text';
    inp.type = visible ? 'password' : 'text';
    btn.innerHTML = visible ? '<i data-lucide="eye"></i>' : '<i data-lucide="eye-off"></i>';
    btn.title = visible ? 'Mostrar contraseña' : 'Ocultar contraseña';
    lucide.createIcons({ nodes: [btn] });
}

// ══════════════════════════════════════════════════════
// SPOTLIGHT TOUR V2 — nuevo sistema de guía interactiva
// Reemplaza el tour anterior sin alterar la lógica de la app
// ══════════════════════════════════════════════════════

const SPOT_PASOS = [
    {
        selector: '#sidebarNav',
        icono: '🗂️',
        titulo: 'Sidebar inteligente',
        desc: 'Filtra por categoría (Personal, Trabajo, Estudio) o crea las tuyas. Cambia entre Pendientes y Completadas al instante. El contador de cada categoría se actualiza en tiempo real.'
    },
    {
        selector: '#addTaskPanelEl',
        icono: '✏️',
        titulo: 'Crear tarea + Estimación IA',
        desc: 'Escribe el nombre, elige prioridad, nivel de energía y fecha. Al agregar, la IA estima automáticamente cuánto tardará y aprende de tu historial. ¡Sin hacer nada extra!'
    },
    {
        selector: '#energiaSelect',
        icono: '⚡',
        titulo: 'Sistema de energía',
        desc: 'Etiqueta cada tarea: 🧠 Alta concentración, ⚡ Normal o 😴 Baja energía. Mocoa detecta tu hora pico y sugiere qué tarea hacer según cómo estás en ese momento del día.'
    },
    {
        selector: '#statsBarEl',
        icono: '📊',
        titulo: 'Panel de progreso',
        desc: 'Total, completadas hoy, vencidas y pendientes de un vistazo. Si tienes más de 8 tareas pendientes, Mocoa te avisa y te empuja a priorizar.'
    },
    {
        selector: '.modo-hoy-btn',
        icono: '🎯',
        titulo: 'Modo Hoy',
        desc: 'El botón más poderoso de la app. Un algoritmo analiza fecha límite + prioridad + nivel de energía según la hora y te muestra solo las 3–5 tareas que realmente deberías hacer hoy.'
    },
    {
        selector: '#listaTareas',
        icono: '🪄',
        titulo: 'Subtareas con IA',
        desc: 'Cada tarea tiene el botón 🪄. Al pulsarlo, Groq la descompone en 3–5 pasos concretos que se agregan como subtareas reales. También puedes escribir subtareas manualmente.'
    },
    {
        selector: '.ia-open-btn',
        icono: '🤖',
        titulo: 'Mocoa AI — Tu coach',
        desc: 'Chat con memoria de contexto, 3 tonos (Directo, Motivador, Estratégico) y botones rápidos. Mocoa sabe qué hiciste ayer, tu racha y tus horas pico para darte consejos reales.'
    },
    {
        selector: '#calFabBtn',
        icono: '📅',
        titulo: 'Calendario visual',
        desc: 'Ve tus tareas organizadas por día. El panel es arrastrable: ponlo donde más te convenga. Los días con tareas se marcan con un punto.'
    },
    {
        selector: '.config-open-btn',
        icono: '⚙️',
        titulo: 'Configuración',
        desc: 'Conecta tu API Key de Groq (gratis en console.groq.com) para activar toda la IA: subtareas, estimaciones, Mocoa. Sin key la app funciona igual, pero sin superpoderes.'
    }
];

let _spotPasoActual = 0;
let _spotElActivo   = null;
let _spotResizeObs  = null;

/* ── Iniciar tour (reemplaza la función del tour antiguo) ── */
function iniciarTour() {
    // Guardar que el usuario ya vio el tour
    if (usuarioActual) localStorage.setItem('tf_tour_v2_' + usuarioActual, '1');

    _spotPasoActual = 0;

    // Limpiar cualquier estado residual del tour anterior
    document.getElementById('tourOverlay')?.classList.add('hidden');
    document.getElementById('tourTooltip')?.classList.add('hidden');
    if (_tourElActivo) { _tourElActivo.classList.remove('tour-highlight'); _tourElActivo = null; }

    // Mostrar overlay y tarjeta
    document.getElementById('spotTourOverlay').classList.add('activo');
    document.getElementById('spotTourCard').classList.add('activo');
    document.body.style.overflow = 'hidden';

    _spotMostrar(_spotPasoActual);

    // Redibujar hueco si la ventana cambia de tamaño
    _spotResizeObs = () => {
        if (_spotElActivo) _spotActualizarHueco(_spotElActivo);
    };
    window.addEventListener('resize', _spotResizeObs);
}

/* ── cerrarTour también limpia el nuevo sistema ── */
function cerrarTour() {
    spotCerrar();
    // Limpiar también el tour antiguo (por si acaso)
    document.getElementById('tourOverlay')?.classList.add('hidden');
    document.getElementById('tourTooltip')?.classList.add('hidden');
    if (_tourElActivo) { _tourElActivo.classList.remove('tour-highlight'); _tourElActivo = null; }
}

/* ── Mostrar un paso específico ── */
function _spotMostrar(idx) {
    const paso  = SPOT_PASOS[idx];
    const total = SPOT_PASOS.length;

    // Actualizar contenido de la tarjeta
    document.getElementById('spotBadge').textContent    = (idx + 1) + ' / ' + total;
    document.getElementById('spotIcon').textContent     = paso.icono;
    document.getElementById('spotCardTitle').textContent = paso.titulo;
    document.getElementById('spotDesc').textContent     = paso.desc;

    // Botones prev/next
    const prevBtn = document.getElementById('spotPrevBtn');
    const nextBtn = document.getElementById('spotNextBtn');
    prevBtn.disabled    = (idx === 0);
    nextBtn.innerHTML = (idx === total - 1)
        ? '<span class="spot-btn-text">Finalizar</span> ✓'
        : '<span class="spot-btn-text">Siguiente</span> →';

    // Puntos de progreso
    const dotsEl = document.getElementById('spotDots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const d = document.createElement('div');
        d.className = 'spot-dot' + (i === idx ? ' activo' : '');
        dotsEl.appendChild(d);
    }

    // Quitar highlight del elemento anterior
    if (_spotElActivo) _spotElActivo.classList.remove('spot-highlighted');

    // Localizar el nuevo elemento
    const el = document.querySelector(paso.selector);
    _spotElActivo = el;

    if (el) {
        el.classList.add('spot-highlighted');
        // Scroll hacia el elemento
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Pequeño delay para que el scroll se complete antes de medir
        setTimeout(() => {
            _spotActualizarHueco(el);
            _spotPosicionarCard(el);
        }, 160);
    } else {
        // Elemento no encontrado: hueco vacío, card centrada
        _spotActualizarHueco(null);
        _spotCentrarCard();
    }
}

/* ── Actualiza el hueco SVG sobre el elemento ── */
function _spotActualizarHueco(el) {
    const hole = document.getElementById('spotHole');
    if (!hole) return;

    if (!el) {
        hole.setAttribute('x', 0);
        hole.setAttribute('y', 0);
        hole.setAttribute('width', 0);
        hole.setAttribute('height', 0);
        return;
    }

    const pad  = 10;
    const rect = el.getBoundingClientRect();
    hole.setAttribute('x',      rect.left   - pad);
    hole.setAttribute('y',      rect.top    - pad);
    hole.setAttribute('width',  rect.width  + pad * 2);
    hole.setAttribute('height', rect.height + pad * 2);
}

/* ── Posiciona la tarjeta cerca del elemento, evitando bordes ── */
function _spotPosicionarCard(el) {
    const card  = document.getElementById('spotTourCard');
    const cW    = card.offsetWidth  || 318;
    const cH    = card.offsetHeight || 280;
    const vW    = window.innerWidth;
    const vH    = window.innerHeight;
    const margen = 16;
    const pad   = 12;

    const rect  = el.getBoundingClientRect();

    // Intentar colocar debajo
    let top  = rect.bottom + pad;
    let left = rect.left + rect.width / 2 - cW / 2;

    // Si no cabe abajo, colocar arriba
    if (top + cH > vH - margen) top = rect.top - cH - pad;
    // Si tampoco cabe arriba, centrar verticalmente
    if (top < margen) top = Math.max(margen, (vH - cH) / 2);

    // Ajustar horizontalmente
    left = Math.max(margen, Math.min(left, vW - cW - margen));

    card.style.top  = top  + 'px';
    card.style.left = left + 'px';
    // Forzar re-animación
    card.classList.remove('activo');
    void card.offsetWidth; // reflow
    card.classList.add('activo');
}

/* ── Centra la tarjeta cuando el elemento no existe ── */
function _spotCentrarCard() {
    const card = document.getElementById('spotTourCard');
    const vW = window.innerWidth;
    const vH = window.innerHeight;
    const cW = card.offsetWidth  || 318;
    const cH = card.offsetHeight || 280;
    card.style.left = ((vW - cW) / 2) + 'px';
    card.style.top  = ((vH - cH) / 2) + 'px';
    card.classList.remove('activo');
    void card.offsetWidth;
    card.classList.add('activo');
}

/* ── Siguiente paso ── */
function spotSiguiente() {
    if (_spotPasoActual >= SPOT_PASOS.length - 1) {
        spotCerrar();
        toast('¡Recorrido completado! Ya conoces todo 🎉', 'success');
        return;
    }
    _spotPasoActual++;
    _spotMostrar(_spotPasoActual);
}

/* ── Paso anterior ── */
function spotAnterior() {
    if (_spotPasoActual <= 0) return;
    _spotPasoActual--;
    _spotMostrar(_spotPasoActual);
}

/* ── Cerrar tour ── */
function spotCerrar() {
    if (_spotElActivo) {
        _spotElActivo.classList.remove('spot-highlighted');
        _spotElActivo = null;
    }
    document.getElementById('spotTourOverlay').classList.remove('activo');
    document.getElementById('spotTourCard').classList.remove('activo');
    document.body.style.overflow = '';
    if (_spotResizeObs) {
        window.removeEventListener('resize', _spotResizeObs);
        _spotResizeObs = null;
    }
}


// ══════════════════════════════════════════════════════════════
// SISTEMA DE ATAJOS DE TECLADO — v1.0
// ══════════════════════════════════════════════════════════════

// ── Modal atajos ──
function abrirAtajosModal() {
    const m = document.getElementById('atajosModal');
    if (!m) return;
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    m.querySelector('.ks-modal-close')?.focus();
    if (window.lucide) lucide.createIcons({ nodes: [m] });
}

function cerrarAtajosModal() {
    const m = document.getElementById('atajosModal');
    if (!m) return;
    m.style.display = 'none';
    document.body.style.overflow = '';
}

// Cerrar modal al click en overlay
document.getElementById('atajosModal')?.addEventListener('click', function(e) {
    if (e.target === this) cerrarAtajosModal();
});

// ── Onboarding tip (una sola vez) ──
function mostrarOnboarding() {
    if (localStorage.getItem('ks_onboarding_visto')) return;
    const tip = document.getElementById('onboardingTip');
    if (!tip) return;
    tip.style.display = 'flex';
    localStorage.setItem('ks_onboarding_visto', '1');
    // Auto-cierre a los 7 segundos
    setTimeout(cerrarOnboarding, 7000);
}

function cerrarOnboarding() {
    const tip = document.getElementById('onboardingTip');
    if (!tip) return;
    tip.style.animation = 'none';
    tip.style.transition = 'opacity 0.35s, transform 0.35s';
    tip.style.opacity = '0';
    tip.style.transform = 'translateX(-50%) translateY(12px)';
    setTimeout(() => { tip.style.display = 'none'; }, 350);
}


setTimeout(mostrarOnboarding, 1500);

// ── Panel de Progreso ──
function abrirProgreso() {
    const panel = document.getElementById('progresoPanel');
    if (!panel) return;
    _renderProgreso();
    panel.classList.add('activo');
    document.body.style.overflow = 'hidden';
    if (window.lucide) lucide.createIcons({ nodes: [panel] });
}

function cerrarProgreso() {
    const panel = document.getElementById('progresoPanel');
    if (panel) panel.classList.remove('activo');
    document.body.style.overflow = '';
}

function _renderProgreso() {
    const cont = document.getElementById('progresoContenido');
    if (!cont) return;
    const hoy              = new Date().toISOString().split('T')[0];
    const perf             = (typeof getPerfil === 'function') ? getPerfil() : {};
    const completadasHoy   = tareas.filter(t => t.completada && t.completadaEn?.startsWith(hoy)).length;
    const completadasTotal = tareas.filter(t => t.completada).length;
    const pendientes       = tareas.filter(t => !t.completada).length;
    const vencidas         = tareas.filter(t => t.fecha && t.fecha < hoy && !t.completada).length;
    const total            = tareas.length;
    const pct              = total > 0 ? Math.round((completadasTotal / total) * 100) : 0;

    cont.innerHTML = `
        <p class="prog-section-title">Resumen de hoy</p>
        <div class="prog-stat-grid">
            <div class="prog-stat-card"><span class="prog-stat-ico">✅</span><span class="prog-stat-num">${completadasHoy}</span><span class="prog-stat-lbl">Completadas hoy</span></div>
            <div class="prog-stat-card"><span class="prog-stat-ico">⏳</span><span class="prog-stat-num">${pendientes}</span><span class="prog-stat-lbl">Pendientes</span></div>
            <div class="prog-stat-card"><span class="prog-stat-ico">🏆</span><span class="prog-stat-num">${completadasTotal}</span><span class="prog-stat-lbl">Total completadas</span></div>
            <div class="prog-stat-card" style="border-color:rgba(192,74,58,0.26)"><span class="prog-stat-ico">⚠️</span><span class="prog-stat-num" style="color:var(--red)">${vencidas}</span><span class="prog-stat-lbl">Vencidas</span></div>
        </div>
        <div class="prog-racha"><span class="prog-racha-ico">🔥</span><div class="prog-racha-info"><p class="prog-racha-num">${perf.rachaActual || 0} días</p><p class="prog-racha-txt">Racha de actividad consecutiva</p></div></div>
        <p class="prog-section-title">Progreso global</p>
        <div class="prog-barra-wrap">
            <div class="prog-barra-label"><span>Completadas</span><span>${completadasTotal} / ${total}</span></div>
            <div class="prog-barra-track"><div class="prog-barra-fill" id="progresoFill" style="width:0%"></div></div>
        </div>
        <div class="prog-stat-grid">
            <div class="prog-stat-card"><span class="prog-stat-ico">📋</span><span class="prog-stat-num">${total}</span><span class="prog-stat-lbl">Total tareas</span></div>
            <div class="prog-stat-card"><span class="prog-stat-ico">🎯</span><span class="prog-stat-num">${pct}%</span><span class="prog-stat-lbl">Tasa de éxito</span></div>
        </div>`;
    requestAnimationFrame(() => {
        const fill = document.getElementById('progresoFill');
        if (fill) fill.style.width = pct + '%';
    });
}

;(function _initKS() {
    const _isTyping = () => {
        const t = (document.activeElement?.tagName || '').toUpperCase();
        return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t);
    };

    const _modalAbierto = () =>
        document.getElementById('atajosModal')?.style.display === 'flex' ||
        document.getElementById('progresoPanel')?.classList.contains('activo') ||
        document.getElementById('mocoaModal')?.classList.contains('activo');

    document.addEventListener('keydown', function(e) {
       
        if ((e.key === '?' || (e.ctrlKey && e.key === '/')) && !_isTyping()) {
            e.preventDefault();
            abrirAtajosModal();
            return;
        }

       
        if (e.key === 'Escape') {
            if (document.getElementById('atajosModal')?.style.display === 'flex') {
                cerrarAtajosModal(); return;
            }
            if (document.getElementById('progresoPanel')?.classList.contains('activo')) {
                if (typeof cerrarProgreso === 'function') cerrarProgreso();
                return;
            }
            return;
        }

        if (_isTyping()) return;

        switch (e.key) {
            case 'n': case 'N': {
                e.preventDefault();
                const inp = document.getElementById('tareaInput');
                if (!inp) break;
                inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => inp.focus(), 200);
                break;
            }
            case '/': {
                e.preventDefault();
                const b = document.getElementById('buscador');
                if (!b) break;
                b.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => b.focus(), 200);
                break;
            }
            case 'a': case 'A':
                e.preventDefault();
                if (typeof abrirMocoaModal === 'function') abrirMocoaModal();
                break;
            case 'h': case 'H':
                e.preventDefault();
                if (typeof abrirModoHoy === 'function') abrirModoHoy();
                break;
            case 'g': case 'G':
                e.preventDefault();
                abrirProgreso();
                break;
        }
    });
})();



// Cerrar sidebar en mobile
function cerrarSidebar() {
    const sb       = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sb) sb.classList.remove('open');
    if (backdrop) backdrop.classList.remove('visible');
    sidebarAbierto = false;
}

// Bottom nav helpers
function bnavSeleccionar(id) {
    document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('bnav' + id.charAt(0).toUpperCase() + id.slice(1));
    if (btn) btn.classList.add('active');
}

function bnavEnfocarInput() {
    const input = document.getElementById('tareaInput');
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => input.focus(), 250);
}

;(function _patchToggle() {
    const _orig = window.toggleSidebar;
    window.toggleSidebar = function () {
        const sb       = document.querySelector('.sidebar');
        const main     = document.querySelector('.main-content');
        const backdrop = document.getElementById('sidebarBackdrop');
        sidebarAbierto = !sidebarAbierto;
        if (window.innerWidth > 768) {
            sb.classList.toggle('closed', !sidebarAbierto);
            main.classList.toggle('full', !sidebarAbierto);
            if (backdrop) backdrop.classList.remove('visible');
        } else {
            sb.classList.toggle('open', sidebarAbierto);
            if (backdrop) backdrop.classList.toggle('visible', sidebarAbierto);
        }
    };
})();


;(function _patchTour() {
    const _orig = window.iniciarTour;
    window.iniciarTour = function () {
        if (window.innerWidth <= 768) {
            cerrarSidebar();
        }
        _orig.apply(this, arguments);
    };
})();
