const socket = io();
let miSala = '';
let miNombre = '';
let esHost = false;
let miTablaCartas = [];
let cartasMarcadas = new Set();
let cartasCantadasIds = new Set();
let juegoActivo = false;
let modoSeleccionado = 'linea';
let sonidoActivo = true;
let powerUpsActivos = {};
let enTorneo = false;
let rondaTorneo = 0;
let jugadoresTorneo = [];
let tablaGenerada = false;
let historialCartas = [];
let musicaActiva = false;
let musicaFondo = null;
let temaActual = 'clasico';
let itemGuardado = null;
let cajaEnCooldown = false;

const POOL_ITEMS = [
  ...Array(40).fill('oraculo'),
  ...Array(30).fill('firewall'),
  ...Array(15).fill('hacker'),
  ...Array(10).fill('glitch'),
  ...Array(5).fill('apagon')
];

const EMOJIS_ITEMS = { 
  oraculo: '👁️', 
  firewall: '🛡️', 
  hacker: '👾', 
  glitch: '🌀', 
  apagon: '🌑' 
};

const NOMBRES_ITEMS = {
  oraculo: 'El Oráculo',
  firewall: 'Firewall',
  hacker: 'El Hacker',
  glitch: 'El Glitch',
  apagon: 'El Apagón'
};

const NOMBRES_MODOS = {
  linea: 'Línea Recta (H, V, Diagonal)',
  cuatro_esquinas: '4 Esquinas Exteriores',
  centro: 'El Centro (Cuadrito 2x2)',
  llena: 'Cartón Lleno (16 Casillas)'
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function reproducirTono(freqInicio, freqFinal, tipo, duracion) {
  if (!sonidoActivo) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = tipo;
    osc.frequency.setValueAtTime(freqInicio, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqFinal, audioCtx.currentTime + duracion);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duracion);
    osc.start();
    osc.stop(audioCtx.currentTime + duracion);
  } catch(e) {}
}

function sonarCarta() {
  reproducirTono(523.25, 783.99, 'triangle', 0.2);
}

function sonarVictoria() {
  const notas = [523.25, 659.25, 783.99, 1046.50];
  notas.forEach((freq, i) => {
    setTimeout(() => reproducirTono(freq, freq * 1.5, 'sine', 0.3), i * 150);
  });
}

function sonarMarcada() {
  reproducirTono(880, 880, 'square', 0.1);
}

function sonarError() {
  reproducirTono(200, 100, 'sawtooth', 0.3);
}

function sonarPowerUp() {
  reproducirTono(600, 1200, 'sine', 0.3);
}

function toggleSonido() {
  sonidoActivo = !sonidoActivo;
  document.querySelector('.gp-sound').textContent = sonidoActivo ? '🔊' : '🔇';
}

function mostrarToast(mensaje, tipo = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensaje;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function lanzarConfeti() {
  const colores = ['#E32636', '#008751', '#FFC107', '#FF6B6B', '#4ECDC4', '#FFD93D'];
  
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      const confeti = document.createElement('div');
      confeti.className = 'confetti';
      confeti.style.left = Math.random() * 100 + 'vw';
      confeti.style.backgroundColor = colores[Math.floor(Math.random() * colores.length)];
      confeti.style.width = (Math.random() * 8 + 5) + 'px';
      confeti.style.height = (Math.random() * 8 + 5) + 'px';
      confeti.style.animationDuration = (Math.random() * 2 + 1) + 's';
      confeti.style.animationDelay = Math.random() + 's';
      document.body.appendChild(confeti);
      
      setTimeout(() => confeti.remove(), 3000);
    }, i * 50);
  }
}

function crearSala() {
  miNombre = document.getElementById('input-nombre').value.trim() || 'Anfitrión';
  const codigo = Math.random().toString(36).substring(2, 6).toUpperCase();
  esHost = true;
  socket.emit('crear_sala', { codigo, hostNombre: miNombre });
}

function unirseSala() {
  miNombre = document.getElementById('input-nombre').value.trim() || 'Invitado';
  const codigo = document.getElementById('input-codigo').value.trim().toUpperCase();
  if (!codigo || codigo.length !== 4) {
    mostrarToast('Por favor ingresa un código de 4 letras válido.', 'error');
    return;
  }
  esHost = false;
  socket.emit('unirse_sala', { codigo, nombre: miNombre });
}

function salirAlMenu() {
  socket.emit('salir_sala', { codigo: miSala });
  miSala = '';
  document.getElementById('pantalla-lobby').style.display = 'none';
  document.getElementById('pantalla-menu').style.display = 'block';
}

socket.on('sala_creada', (codigo) => {
  miSala = codigo;
  esHost = true;
  mostrarLobby();
  mostrarToast(`Sala creada: ${codigo}`, 'success');
});

socket.on('unido_con_exito', ({ codigo }) => {
  miSala = codigo;
  esHost = false;
  mostrarLobby();
  mostrarToast(`Te uniste a la sala: ${codigo}`, 'success');
});

socket.on('error_sala', (msj) => {
  mostrarToast(msj, 'error');
  sonarError();
});

socket.on('mensaje_chat', (datos) => {
  const chatBox = document.getElementById('chat-mensajes');
  if (!chatBox) return;
  
  const mensajeDiv = document.createElement('div');
  mensajeDiv.className = 'mensaje-chat';
  
  if (datos.sistema) {
    mensajeDiv.className += ' sistema';
    mensajeDiv.textContent = `📢 ${datos.mensaje}`;
  } else {
    mensajeDiv.className += ' jugador';
    mensajeDiv.innerHTML = `<strong>${datos.jugador}:</strong> ${datos.mensaje}`;
  }
  
  chatBox.appendChild(mensajeDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
});

function enviarMensaje() {
  const input = document.getElementById('input-chat');
  const mensaje = input.value.trim();
  if (mensaje && miSala) {
    socket.emit('enviar_mensaje', { codigo: miSala, mensaje });
    input.value = '';
  }
}

function copiarCodigo() {
  navigator.clipboard.writeText(miSala).then(() => {
    mostrarToast('Código copiado al portapapeles', 'success');
  });
}

function generarLinkInvitacion() {
  const link = `${window.location.origin}/?sala=${miSala}`;
  navigator.clipboard.writeText(link).then(() => {
    mostrarToast('Link de invitación copiado al portapapeles', 'success');
  });
}

function cambiarTab(tab) {
  if (!esHost) {
    mostrarToast('Solo el anfitrión puede cambiar esta configuración.', 'error');
    return;
  }
  
  document.querySelectorAll('.gp-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.gp-tab-content').forEach(c => c.classList.remove('active'));
  
  event.target.classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

function seleccionarModo(elemento, modo) {
  if (!esHost) {
    mostrarToast('Solo el anfitrión puede seleccionar el modo.', 'error');
    return;
  }
  
  document.querySelectorAll('.gp-mode-card').forEach(c => c.classList.remove('active'));
  elemento.classList.add('active');
  modoSeleccionado = modo;
  
  socket.emit('cambiar_modo', { codigo: miSala, modo });
}

socket.on('modo_actualizado', ({ modo, esTorneo }) => {
  modoSeleccionado = modo;
  enTorneo = esTorneo || false;
  
  document.querySelectorAll('.gp-mode-card').forEach(c => {
    if (c.dataset.modo === modo) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
  
  if (enTorneo) {
    document.getElementById('btn-empezar').textContent = '▶ INICIAR TORNEO';
  } else {
    document.getElementById('btn-empezar').textContent = '▶ EMPEZAR';
  }
});

function cambiarTema(tema) {
  temaActual = tema;
  
  const temas = {
    clasico: {
      fondo: 'linear-gradient(135deg, #008751 0%, #005a36 30%, #2a2a2a 50%, #9b1924 70%, #E32636 100%)',
      carta: '#fff9c4',
      tablero: 'rgba(255, 255, 255, 0.95)'
    },
    noche: {
      fondo: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      carta: '#2d2d2d',
      tablero: 'rgba(26, 26, 46, 0.95)'
    },
    neon: {
      fondo: 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 50%, #45b7d1 100%)',
      carta: '#ffffff',
      tablero: 'rgba(255, 255, 255, 0.9)'
    }
  };
  
  const temaSeleccionado = temas[tema];
  document.body.style.background = temaSeleccionado.fondo;
  document.body.style.backgroundAttachment = 'fixed';
  
  document.querySelectorAll('.carta-mexicana.grande').forEach(c => {
    c.style.backgroundColor = temaSeleccionado.carta;
  });
  
  const tablero = document.querySelector('.grid-tablero');
  if (tablero) tablero.style.backgroundColor = temaSeleccionado.tablero;
  
  socket.emit('cambiar_tema', { codigo: miSala, tema });
}

function toggleMusica() {
  if (musicaActiva) {
    if (musicaFondo) {
      musicaFondo.pause();
      musicaFondo = null;
    }
    musicaActiva = false;
    document.getElementById('btn-musica').textContent = '🎵 Música: OFF';
  } else {
    musicaFondo = new Audio('audio/musica_fondo.mp3');
    musicaFondo.loop = true;
    musicaFondo.volume = 0.3;
    musicaFondo.play().catch(() => {
      mostrarToast('No se pudo cargar la música', 'error');
    });
    musicaActiva = true;
    document.getElementById('btn-musica').textContent = '🎵 Música: ON';
  }
}

function mostrarLobby() {
  document.getElementById('pantalla-menu').style.display = 'none';
  document.getElementById('pantalla-juego').style.display = 'none';
  document.getElementById('modal-ganador').style.display = 'none';
  document.getElementById('pantalla-lobby').style.display = 'block';
  
  const chatBox = document.getElementById('chat-mensajes');
  if (chatBox) chatBox.innerHTML = '';
  
  juegoActivo = false;
  cartasMarcadas = new Set();
  cartasCantadasIds = new Set();
  powerUpsActivos = {};
  tablaGenerada = false;
  historialCartas = [];
  itemGuardado = null;
  cajaEnCooldown = false;
  
  if (esHost) {
    document.getElementById('btn-empezar').style.display = 'block';
    document.getElementById('tiempo-carta').disabled = false;
    document.getElementById('modo-powerups').disabled = false;
    document.getElementById('tipo-torneo').disabled = false;
    document.getElementById('btn-pausa').style.display = 'block';
  } else {
    document.getElementById('btn-empezar').style.display = 'none';
    document.getElementById('tiempo-carta').disabled = true;
    document.getElementById('modo-powerups').disabled = true;
    document.getElementById('tipo-torneo').disabled = true;
    document.getElementById('btn-pausa').style.display = 'none';
  }
}

socket.on('actualizar_jugadores', (jugadores) => {
  document.getElementById('total-jugadores').innerText = jugadores.length;
  
  const listaGartic = document.getElementById('lista-jugadores-gartic');
  listaGartic.innerHTML = '';
  
  for (let i = 0; i < 20; i++) {
    if (i < jugadores.length) {
      const jugador = jugadores[i];
      const div = document.createElement('div');
      div.className = `gp-player-card ${jugador.esHost ? 'host' : ''}`;
      div.innerHTML = `
        <div class="gp-avatar">${jugador.esHost ? '👑' : '🎮'}</div>
        <span class="gp-name">${jugador.nombre}</span>
        ${jugador.victorias ? `<span class="badge-victorias">🏆 ${jugador.victorias}</span>` : ''}
      `;
      listaGartic.appendChild(div);
    } else {
      const div = document.createElement('div');
      div.className = 'gp-player-card empty';
      div.innerHTML = '<span>Vacío</span>';
      listaGartic.appendChild(div);
    }
  }
});

function iniciarPartida() {
  if (!esHost) {
    mostrarToast('Solo el anfitrión puede iniciar la partida.', 'error');
    return;
  }
  
  const segundos = parseInt(document.getElementById('tiempo-carta').value) || 4;
  const powerUpsActivados = document.getElementById('modo-powerups').value === 'on';
  const tipoTorneo = document.getElementById('tipo-torneo').value;
  
  if (tipoTorneo !== 'no') {
    enTorneo = true;
    socket.emit('iniciar_torneo', { 
      codigo: miSala, 
      segundos, 
      modo: modoSeleccionado,
      powerUpsActivados,
      tipoTorneo
    });
  } else {
    enTorneo = false;
    socket.emit('iniciar_juego', { 
      codigo: miSala, 
      segundos, 
      modo: modoSeleccionado,
      powerUpsActivados
    });
  }
}

socket.on('torneo_iniciado', ({ jugadores, rondas }) => {
  enTorneo = true;
  rondaTorneo = 1;
  jugadoresTorneo = jugadores;
  mostrarToast(`¡Torneo iniciado! ${jugadores.length} jugadores`, 'info');
});

socket.on('juego_iniciado', ({ modo, totalJugadores, powerUpsActivados, ronda }) => {
  document.getElementById('pantalla-lobby').style.display = 'none';
  document.getElementById('modal-ganador').style.display = 'none';
  document.getElementById('pantalla-juego').style.display = 'block';
  document.getElementById('modo-juego-txt').innerText = NOMBRES_MODOS[modo] || modo;
  document.getElementById('contador-cartas').innerText = '0/0';
  document.getElementById('total-jugadores-juego').innerText = totalJugadores;
  
  if (ronda) {
    document.getElementById('modo-juego-txt').innerText += ` - Ronda ${ronda}`;
  }
  
  juegoActivo = true;
  cartasMarcadas = new Set();
  cartasCantadasIds = new Set();
  tablaGenerada = false;
  historialCartas = [];
  itemGuardado = null;
  cajaEnCooldown = false;
  
  if (powerUpsActivados) {
    document.getElementById('powerups-container').style.display = 'flex';
  } else {
    document.getElementById('powerups-container').style.display = 'none';
  }
  
  generarTablero();
  actualizarEstadisticasTiempoReal();
  mostrarToast(`¡Partida iniciada! Modo: ${NOMBRES_MODOS[modo]}`, 'info');
});

socket.on('barajeando', () => {
  mostrarToast('🃏 Barajeando cartas...', 'info');
  document.getElementById('carta-titulo').innerText = 'Barajeando...';
});

function generarTablero() {
  const tablero = document.getElementById('tablero');
  tablero.innerHTML = '';
  
  const barajadas = [...CARTAS].sort(() => Math.random() - 0.5).slice(0, 16);
  miTablaCartas = barajadas.map(c => c.id);
  tablaGenerada = true;

  socket.emit('registrar_tabla', { codigo: miSala, idsCartas: miTablaCartas });

  barajadas.forEach((c, index) => {
    const casilla = document.createElement('div');
    casilla.className = 'carta-mexicana tablero-item';
    casilla.dataset.indice = index;
    casilla.dataset.cartaId = c.id;
    
    casilla.style.animation = `aparecerCarta 0.4s ease-out ${index * 0.05}s both`;
    
    casilla.innerHTML = `
      <div class="carta-num">${c.id}</div>
      <div class="carta-img-wrap">
        <span class="placeholder-icon" style="display:flex; font-size:36px;">${c.emoji || '🖥️'}</span>
      </div>
      <div class="carta-nombre">${c.nombre}</div>
      <div class="frijolito">🫘</div>
    `;

    casilla.onclick = () => {
      if (!juegoActivo) {
        mostrarToast('El juego no está activo.', 'error');
        return;
      }
      
      if (powerUpsActivos.firewall) {
        mostrarToast('🛡️ Firewall activo, no puedes ser atacado.', 'info');
      }
      
      const cartaId = parseInt(casilla.dataset.cartaId);
      const index = parseInt(casilla.dataset.indice);
      
      if (!cartasCantadasIds.has(cartaId)) {
        mostrarToast('Esta carta aún no ha sido cantada.', 'error');
        sonarError();
        return;
      }
      
      const estaMarcada = casilla.classList.contains('marcada');
      
      if (estaMarcada) {
        casilla.classList.remove('marcada');
        cartasMarcadas.delete(index);
      } else {
        casilla.classList.add('marcada');
        cartasMarcadas.add(index);
        sonarMarcada();
      }
      
      socket.emit('actualizar_progreso', { 
        codigo: miSala, 
        marcadas: cartasMarcadas.size 
      });
      
      actualizarEstadisticasTiempoReal();
    };

    tablero.appendChild(casilla);
  });
}

function actualizarHistorial() {
  const historialDiv = document.getElementById('historial-cartas');
  if (!historialDiv) return;
  
  historialDiv.innerHTML = historialCartas.map(c => 
    `<span class="carta-historial" title="${c.nombre}">${c.emoji || '🖥️'}</span>`
  ).join('');
}

function actualizarEstadisticasTiempoReal() {
  const cantadas = document.getElementById('stat-cantadas');
  const marcadas = document.getElementById('stat-marcadas');
  const progreso = document.getElementById('stat-progreso');
  
  if (cantadas) cantadas.innerText = cartasCantadasIds.size;
  if (marcadas) marcadas.innerText = `${cartasMarcadas.size}/16`;
  if (progreso) progreso.innerText = `${Math.round((cartasMarcadas.size / 16) * 100)}%`;
}

function enviarReaccion(reaccion) {
  socket.emit('enviar_reaccion', { codigo: miSala, reaccion });
  mostrarReaccionLocal(reaccion);
}

function mostrarReaccionLocal(reaccion) {
  const reaccionDiv = document.createElement('div');
  reaccionDiv.className = 'reaccion-flotante';
  reaccionDiv.textContent = reaccion;
  reaccionDiv.style.left = (Math.random() * 60 + 20) + '%';
  reaccionDiv.style.top = (Math.random() * 40 + 30) + '%';
  document.body.appendChild(reaccionDiv);
  
  setTimeout(() => reaccionDiv.remove(), 2000);
}

socket.on('reaccion_recibida', ({ jugador, reaccion }) => {
  mostrarToast(`${jugador} reaccionó: ${reaccion}`, 'info');
  mostrarReaccionLocal(reaccion);
});

socket.on('tema_actualizado', ({ tema }) => {
  if (tema !== temaActual) {
    cambiarTema(tema);
  }
});

socket.on('bracket_actualizado', ({ bracket }) => {
  mostrarBracket(bracket);
});

function mostrarBracket(bracket) {
  const bracketContainer = document.getElementById('bracket-container');
  const bracketVisual = document.getElementById('bracket-visual');
  
  if (!bracketContainer || !bracketVisual) return;
  
  bracketContainer.style.display = 'block';
  bracketVisual.innerHTML = '';
  
  const rondas = {};
  bracket.forEach(partida => {
    if (!rondas[partida.ronda]) {
      rondas[partida.ronda] = [];
    }
    rondas[partida.ronda].push(partida);
  });
  
  Object.keys(rondas).forEach(ronda => {
    const rondaDiv = document.createElement('div');
    rondaDiv.className = 'bracket-ronda';
    rondaDiv.innerHTML = `<h4>Ronda ${ronda}</h4>`;
    
    rondas[ronda].forEach(partida => {
      const partidaDiv = document.createElement('div');
      partidaDiv.className = 'bracket-partida';
      
      const jugador1 = jugadoresTorneo.find(j => j.id === partida.jugador1);
      const jugador2 = partida.jugador2 ? jugadoresTorneo.find(j => j.id === partida.jugador2) : null;
      
      if (partida.ganador) {
        partidaDiv.classList.add('ganadora');
      }
      
      partidaDiv.innerHTML = `
        ${jugador1 ? jugador1.nombre : 'TBD'} vs ${jugador2 ? jugador2.nombre : 'BYE'}
        ${partida.ganador ? '✅' : ''}
      `;
      
      rondaDiv.appendChild(partidaDiv);
    });
    
    bracketVisual.appendChild(rondaDiv);
  });
}

socket.on('nueva_carta', ({ carta, totalCantadas, totalCartas }) => {
  if (!juegoActivo) return;
  
  const idBuscado = typeof carta === 'object' ? carta.id : carta;
  const cartaActual = CARTAS.find(c => c.id == idBuscado);
  
  if (!cartaActual) {
    console.warn("Carta no encontrada en el catálogo local:", carta);
    return;
  }
  
  cartasCantadasIds.add(cartaActual.id);
  historialCartas.push(cartaActual);
  
  if (historialCartas.length > 12) {
    historialCartas.shift();
  }
  
  actualizarHistorial();
  actualizarEstadisticasTiempoReal();
  
  document.getElementById('contador-cartas').innerText = `${totalCantadas}/${totalCartas || '?'}`;
  document.getElementById('carta-num').innerText = cartaActual.id;
  document.getElementById('carta-titulo').innerText = cartaActual.nombre;

  const imgBox = document.getElementById('carta-img-box');
  
  if (cartaActual.img) {
    imgBox.innerHTML = `
      <img src="${cartaActual.img}" alt="${cartaActual.nombre}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <span class="placeholder-icon" style="display:none;">${cartaActual.emoji || '🖥️'}</span>
    `;
  } else {
    imgBox.innerHTML = `
      <span class="placeholder-icon" style="display:flex;">${cartaActual.emoji || '🖥️'}</span>
    `;
  }

  if (cartaActual.audio) {
    const audio = new Audio(cartaActual.audio);
    audio.play().catch(() => sonarCarta());
  } else {
    sonarCarta();
  }

  const indiceEnTablero = miTablaCartas.indexOf(cartaActual.id);
  if (indiceEnTablero !== -1) {
    const casilla = document.querySelector(`[data-indice="${indiceEnTablero}"]`);
    if (casilla) {
      casilla.style.boxShadow = '0 0 15px rgba(255,193,7,0.8)';
      setTimeout(() => {
        casilla.style.boxShadow = '';
      }, 2000);
    }
  }
});

socket.on('progreso_jugadores', (jugadores) => {
  const lista = document.getElementById('lista-progreso');
  lista.innerHTML = jugadores.map(j => `
    <li class="jugador-item">
      <img src="${j.avatar}" class="avatar-mini" alt="avatar">
      <div class="jugador-info">
        <span class="nombre">${j.nombre} ${j.esHost ? '👑' : ''}</span>
        <div class="barra-progreso-bg">
          <div class="barra-progreso-fill" style="width: ${(j.marcadas / 16) * 100}%"></div>
        </div>
      </div>
      <span class="progreso-num">${j.marcadas}/16</span>
    </li>
  `).join('');
});

function abrirCajaMisteriosa() {
  if (!juegoActivo || cajaEnCooldown || itemGuardado) {
    if (itemGuardado) mostrarToast('Ya tienes un poder, úsalo primero.', 'error');
    return;
  }

  cajaEnCooldown = true;
  const btnCaja = document.getElementById('btn-caja');
  btnCaja.classList.add('cooldown');
  
  setTimeout(() => {
    cajaEnCooldown = false;
    btnCaja.classList.remove('cooldown');
    sonarMarcada();
    mostrarToast('📦 ¡La caja misteriosa está disponible!', 'info');
  }, 20000);

  let ticks = 0;
  const ruleta = setInterval(() => {
    document.getElementById('slot-item').innerText = EMOJIS_ITEMS[POOL_ITEMS[Math.floor(Math.random() * 100)]];
    ticks++;
    
    if (ticks > 10) {
      clearInterval(ruleta);
      itemGuardado = POOL_ITEMS[Math.floor(Math.random() * 100)];
      const slot = document.getElementById('slot-item');
      slot.innerText = EMOJIS_ITEMS[itemGuardado];
      slot.classList.add('lleno');
      slot.title = NOMBRES_ITEMS[itemGuardado];
      sonarPowerUp();
      mostrarToast(`📦 Obtuviste: ${NOMBRES_ITEMS[itemGuardado]}`, 'success');
    }
  }, 100);
}

function usarItemGuardado() {
  if (!itemGuardado || !juegoActivo) return;
  
  const tipo = itemGuardado;
  socket.emit('usar_powerup', { codigo: miSala, tipo });
  
  mostrarToast(`Usaste: ${NOMBRES_ITEMS[tipo]}`, 'info');
  
  itemGuardado = null;
  const slot = document.getElementById('slot-item');
  slot.innerText = '';
  slot.classList.remove('lleno');
  slot.title = '';
}

socket.on('sufrir_glitch', () => {
  if (powerUpsActivos.firewall) {
    mostrarToast('🛡️ Firewall bloqueó el Glitch.', 'success');
    return;
  }
  
  document.body.classList.add('efecto-glitch');
  setTimeout(() => document.body.classList.remove('efecto-glitch'), 500);

  const tablero = document.getElementById('tablero');
  for (let i = tablero.children.length; i >= 0; i--) {
    tablero.appendChild(tablero.children[Math.random() * i | 0]);
  }
  
  mostrarToast('🌀 ¡Un Glitch desordenó tu tablero!', 'error');
  sonarError();
});

socket.on('sufrir_apagon', () => {
  if (powerUpsActivos.firewall) {
    mostrarToast('🛡️ Firewall bloqueó el Apagón.', 'success');
    return;
  }
  
  const oscuridad = document.createElement('div');
  oscuridad.className = 'efecto-apagon';
  document.body.appendChild(oscuridad);
  sonarError();

  setTimeout(() => {
    oscuridad.remove();
  }, 4000);
});

socket.on('recibir_ataque_hacker', () => {
  if (powerUpsActivos.firewall) {
    mostrarToast('🛡️ Firewall bloqueó el ataque del Hacker.', 'success');
    socket.emit('ataque_bloqueado', { codigo: miSala });
    return;
  }
  
  const casillasMarcadas = document.querySelectorAll('.tablero-item.marcada');
  
  if (casillasMarcadas.length > 0) {
    const casillaAleatoria = casillasMarcadas[Math.floor(Math.random() * casillasMarcadas.length)];
    const indice = parseInt(casillaAleatoria.dataset.indice);
    
    casillaAleatoria.classList.add('efecto-hacker');
    setTimeout(() => casillaAleatoria.classList.remove('efecto-hacker'), 1000);
    
    setTimeout(() => {
      casillaAleatoria.classList.remove('marcada');
      cartasMarcadas.delete(indice);
      
      socket.emit('actualizar_progreso', { 
        codigo: miSala, 
        marcadas: cartasMarcadas.size 
      });
      
      actualizarEstadisticasTiempoReal();
    }, 500);
    
    mostrarToast('👾 ¡El Hacker eliminó uno de tus frijolitos!', 'error');
    sonarError();
  }
});

socket.on('escudo_activado', () => {
  powerUpsActivos.firewall = true;
  mostrarToast('🛡️ Firewall activado por 15 segundos', 'success');
  
  setTimeout(() => {
    powerUpsActivos.firewall = false;
    mostrarToast('🛡️ Firewall desactivado', 'info');
  }, 15000);
});

function cantarLoteria() {
  if (!juegoActivo) {
    mostrarToast('El juego no está activo.', 'error');
    return;
  }
  
  if (cartasMarcadas.size < 4) {
    mostrarToast('Debes tener al menos 4 cartas marcadas para cantar lotería.', 'error');
    sonarError();
    return;
  }
  
  socket.emit('cantar_loteria', { codigo: miSala });
}

function pausarJuego() {
  if (esHost) {
    socket.emit('pausar_juego', { codigo: miSala });
  }
}

function reanudarJuego() {
  if (esHost) {
    socket.emit('reanudar_juego', { codigo: miSala });
  }
}

socket.on('juego_pausado', () => {
  document.getElementById('modal-pausa').style.display = 'flex';
});

socket.on('juego_reanudado', () => {
  document.getElementById('modal-pausa').style.display = 'none';
});

socket.on('loteria_invalida', (mensaje) => {
  mostrarToast(`⚠️ ${mensaje}`, 'error');
  sonarError();
});

socket.on('declarar_ganador', ({ ganador, modo, estadisticas, ronda, esFinal }) => {
  juegoActivo = false;
  
  document.getElementById('texto-ganador').innerHTML = `
    ¡<strong>${ganador}</strong> completó el modo <strong>${NOMBRES_MODOS[modo]}</strong>!
  `;
  
  if (estadisticas) {
    const statsHTML = estadisticas.map(e => `
      <div class="stat-item">
        <span>${e.nombre}:</span>
        <span>🏆 ${e.victorias} victorias | ⭐ ${e.puntuacion} pts</span>
      </div>
    `).join('');
    document.getElementById('texto-ganador').innerHTML += `<div class="stats-box">${statsHTML}</div>`;
  }
  
  document.getElementById('modal-ganador').style.display = 'flex';
  lanzarConfeti();
  sonarVictoria();
  
  if (esHost && enTorneo && !esFinal) {
    document.getElementById('opciones-fin-host').style.display = 'block';
    document.getElementById('esperando-reinicio').style.display = 'none';
    document.getElementById('btn-siguiente-ronda').style.display = 'block';
  } else if (esHost) {
    document.getElementById('opciones-fin-host').style.display = 'block';
    document.getElementById('esperando-reinicio').style.display = 'none';
    document.getElementById('btn-siguiente-ronda').style.display = 'none';
  } else {
    document.getElementById('opciones-fin-host').style.display = 'none';
    document.getElementById('esperando-reinicio').style.display = 'block';
  }
});

function siguienteRonda() {
  socket.emit('siguiente_ronda', { codigo: miSala });
  document.getElementById('modal-ganador').style.display = 'none';
}

socket.on('torneo_actualizado', ({ rondas, jugadores, campeon }) => {
  if (campeon) {
    enTorneo = false;
    document.getElementById('texto-ganador').innerHTML = `
      ¡<strong>${campeon}</strong> es el CAMPEÓN del torneo! 🏆👑
    `;
    document.getElementById('modal-ganador').style.display = 'flex';
    lanzarConfeti();
    sonarVictoria();
  }
});

function volverAlLobby() {
  enTorneo = false;
  rondaTorneo = 0;
  juegoActivo = false;
  cartasMarcadas = new Set();
  cartasCantadasIds = new Set();
  powerUpsActivos = {};
  tablaGenerada = false;
  historialCartas = [];
  itemGuardado = null;
  cajaEnCooldown = false;
  socket.emit('volver_al_lobby', { codigo: miSala });
}

socket.on('ir_a_lobby', () => {
  mostrarLobby();
});

socket.on('fin_mazo', () => {
  juegoActivo = false;
  mostrarToast('No se pudieron cantar cartas. Volviendo al lobby...', 'error');
  
  setTimeout(() => {
    if (esHost) {
      volverAlLobby();
    }
  }, 3000);
});

window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const salaParam = urlParams.get('sala');
  if (salaParam) {
    document.getElementById('input-codigo').value = salaParam.toUpperCase();
  }
});