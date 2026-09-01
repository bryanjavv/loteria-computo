const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const CARTAS = require('./public/data/cartas.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const salas = {};
const SALA_TIMEOUT = 30 * 60 * 1000;
const MAX_JUGADORES = 20;

const PATRONES = {
  cuatro_esquinas: [[0, 3, 12, 15]],
  centro: [[5, 6, 9, 10]],
  llena: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]],
  linea: [
    [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
    [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
    [0, 5, 10, 15], [3, 6, 9, 12]
  ]
};

function verificarVictoria(modo, tablaJugador, cartasCantadasIds) {
  const marcadasValidas = new Set();
  const cartasCantadasSet = new Set(cartasCantadasIds);
  
  tablaJugador.forEach((idCarta, index) => {
    if (cartasCantadasSet.has(idCarta)) {
      marcadasValidas.add(index);
    }
  });

  const combinaciones = PATRONES[modo] || PATRONES.llena;
  return combinaciones.some(combo => combo.every(indice => marcadasValidas.has(indice)));
}

function generarAvatar(nombre) {
  const avatars = ['avataaars', 'bottts', 'fun-emoji', 'identicon', 'initials'];
  const estilo = avatars[Math.floor(Math.random() * avatars.length)];
  return `https://api.dicebear.com/7.x/${estilo}/svg?seed=${encodeURIComponent(nombre)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

function generarCodigoSala() {
  let codigo;
  do {
    codigo = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (salas[codigo]);
  return codigo;
}

function crearMazoGarantizado(jugadores) {
  return [...CARTAS].sort(() => Math.random() - 0.5);
}

function crearBracketTorneo(jugadores) {
  const bracket = [];
  const jugadoresBarajados = [...jugadores].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < jugadoresBarajados.length; i += 2) {
    if (i + 1 < jugadoresBarajados.length) {
      bracket.push({
        jugador1: jugadoresBarajados[i].id,
        jugador2: jugadoresBarajados[i + 1].id,
        ganador: null,
        ronda: 1
      });
    } else {
      bracket.push({
        jugador1: jugadoresBarajados[i].id,
        jugador2: null,
        ganador: jugadoresBarajados[i].id,
        ronda: 1,
        bye: true
      });
    }
  }
  
  return bracket;
}

function limpiarSalasInactivas() {
  const ahora = Date.now();
  for (const codigo in salas) {
    if (ahora - salas[codigo].ultimoUso > SALA_TIMEOUT) {
      clearTimeout(salas[codigo].intervalo);
      delete salas[codigo];
    }
  }
}

setInterval(limpiarSalasInactivas, 5 * 60 * 1000);

io.on('connection', (socket) => {
  console.log(`🎮 Nuevo jugador conectado: ${socket.id}`);

  socket.on('crear_sala', ({ codigo, hostNombre }) => {
    const codigoFinal = codigo || generarCodigoSala();
    
    salas[codigoFinal] = {
      codigo: codigoFinal,
      host: socket.id,
      jugadores: [{ 
        id: socket.id, 
        nombre: hostNombre, 
        esHost: true, 
        tabla: [], 
        marcadas: 0, 
        avatar: generarAvatar(hostNombre),
        puntuacion: 0,
        victorias: 0,
        bloqueado: false,
        escudoActivo: false
      }],
      intervalo: null,
      mazo: [],
      indiceCarta: 0,
      cartasCantadas: [],
      modoJuego: 'linea',
      enJuego: false,
      pausado: false,
      powerUpsActivados: false,
      modoTorneo: false,
      tipoTorneo: null,
      ultimoUso: Date.now(),
      chat: [],
      torneo: null,
      segundos: 4,
      tema: 'clasico'
    };
    
    socket.join(codigoFinal);
    socket.emit('sala_creada', codigoFinal);
    io.to(codigoFinal).emit('actualizar_jugadores', salas[codigoFinal].jugadores);
    io.to(codigoFinal).emit('mensaje_chat', {
      sistema: true,
      mensaje: `${hostNombre} creó la sala`
    });
  });

  socket.on('unirse_sala', ({ codigo, nombre }) => {
    const sala = salas[codigo];
    if (!sala) {
      return socket.emit('error_sala', 'La sala no existe o ha expirado.');
    }
    if (sala.enJuego) {
      return socket.emit('error_sala', 'Partida en curso. Espera a que termine.');
    }
    if (sala.jugadores.length >= MAX_JUGADORES) {
      return socket.emit('error_sala', `La sala está llena (máximo ${MAX_JUGADORES} jugadores).`);
    }

    const jugador = {
      id: socket.id,
      nombre,
      esHost: false,
      tabla: [],
      marcadas: 0,
      avatar: generarAvatar(nombre),
      puntuacion: 0,
      victorias: 0,
      bloqueado: false,
      escudoActivo: false
    };
    
    sala.jugadores.push(jugador);
    sala.ultimoUso = Date.now();
    socket.join(codigo);
    socket.emit('unido_con_exito', { codigo });
    io.to(codigo).emit('actualizar_jugadores', sala.jugadores);
    io.to(codigo).emit('mensaje_chat', {
      sistema: true,
      mensaje: `${nombre} se unió a la sala`
    });
  });

  socket.on('salir_sala', ({ codigo }) => {
    const sala = salas[codigo];
    if (!sala) return;
    
    const jugador = sala.jugadores.find(j => j.id === socket.id);
    if (jugador) {
      sala.jugadores = sala.jugadores.filter(j => j.id !== socket.id);
      
      if (sala.jugadores.length === 0) {
        clearTimeout(sala.intervalo);
        delete salas[codigo];
      } else {
        if (socket.id === sala.host) {
          sala.host = sala.jugadores[0].id;
          sala.jugadores[0].esHost = true;
        }
        
        io.to(codigo).emit('actualizar_jugadores', sala.jugadores);
        io.to(codigo).emit('mensaje_chat', {
          sistema: true,
          mensaje: `${jugador.nombre} abandonó la sala`
        });
      }
    }
  });

  socket.on('enviar_mensaje', ({ codigo, mensaje }) => {
    const sala = salas[codigo];
    if (!sala) return;
    
    const jugador = sala.jugadores.find(j => j.id === socket.id);
    if (!jugador) return;
    
    const mensajeLimpio = mensaje.trim().substring(0, 200);
    if (!mensajeLimpio) return;
    
    sala.chat.push({
      jugador: jugador.nombre,
      mensaje: mensajeLimpio,
      timestamp: Date.now()
    });
    
    if (sala.chat.length > 50) {
      sala.chat = sala.chat.slice(-50);
    }
    
    io.to(codigo).emit('mensaje_chat', {
      jugador: jugador.nombre,
      mensaje: mensajeLimpio,
      avatar: jugador.avatar
    });
  });

  socket.on('enviar_reaccion', ({ codigo, reaccion }) => {
    const sala = salas[codigo];
    if (!sala) return;
    
    const jugador = sala.jugadores.find(j => j.id === socket.id);
    if (!jugador) return;
    
    const reaccionesValidas = ['👍', '😂', '😮', '👏', '🎉'];
    if (!reaccionesValidas.includes(reaccion)) return;
    
    io.to(codigo).emit('reaccion_recibida', {
      jugador: jugador.nombre,
      reaccion
    });
  });

  socket.on('cambiar_tema', ({ codigo, tema }) => {
    const sala = salas[codigo];
    if (!sala) return;
    
    const temasValidos = ['clasico', 'noche', 'neon'];
    if (!temasValidos.includes(tema)) return;
    
    sala.tema = tema;
    io.to(codigo).emit('tema_actualizado', { tema });
  });

  socket.on('cambiar_modo', ({ codigo, modo }) => {
    const sala = salas[codigo];
    if (!sala || socket.id !== sala.host) return;
    
    if (!PATRONES[modo]) {
      return socket.emit('error_sala', 'Modo no válido.');
    }
    
    sala.modoJuego = modo;
    sala.modoTorneo = false;
    sala.tipoTorneo = null;
    
    io.to(codigo).emit('modo_actualizado', {
      modo: sala.modoJuego,
      esTorneo: false
    });
  });

  socket.on('cambiar_torneo', ({ codigo, tipoTorneo }) => {
    const sala = salas[codigo];
    if (!sala || socket.id !== sala.host) return;
    
    if (tipoTorneo === 'no') {
      sala.modoTorneo = false;
      sala.tipoTorneo = null;
    } else {
      sala.modoTorneo = true;
      sala.tipoTorneo = tipoTorneo;
    }
    
    io.to(codigo).emit('modo_actualizado', {
      modo: sala.modoJuego,
      esTorneo: sala.modoTorneo,
      tipoTorneo: sala.tipoTorneo
    });
  });

  socket.on('cambiar_ajustes', ({ codigo, segundos, powerUpsActivados }) => {
    const sala = salas[codigo];
    if (!sala || socket.id !== sala.host) return;
    
    sala.segundos = segundos || 4;
    sala.powerUpsActivados = powerUpsActivados || false;
    
    io.to(codigo).emit('ajustes_actualizados', {
      segundos: sala.segundos,
      powerUpsActivados: sala.powerUpsActivados
    });
  });

  socket.on('registrar_tabla', ({ codigo, idsCartas }) => {
    const sala = salas[codigo];
    if (sala) {
      const jugador = sala.jugadores.find(j => j.id === socket.id);
      if (jugador) {
        jugador.tabla = idsCartas;
        jugador.marcadas = 0;
      }
    }
  });

  socket.on('iniciar_juego', ({ codigo, segundos, modo, powerUpsActivados }) => {
    const sala = salas[codigo];
    if (!sala || socket.id !== sala.host) return;
    
    if (sala.jugadores.length < 1) {
      return socket.emit('loteria_invalida', 'No hay jugadores suficientes.');
    }

    sala.segundos = segundos || sala.segundos || 4;
    sala.powerUpsActivados = powerUpsActivados || sala.powerUpsActivados;
    sala.modoJuego = modo || sala.modoJuego;
    sala.modoTorneo = false;
    sala.tipoTorneo = null;
    
    iniciarPartidaNormal(sala);
  });

  socket.on('iniciar_torneo', ({ codigo, segundos, modo, powerUpsActivados, tipoTorneo }) => {
    const sala = salas[codigo];
    if (!sala || socket.id !== sala.host) return;
    
    if (sala.jugadores.length < 2) {
      return socket.emit('loteria_invalida', 'Se requieren al menos 2 jugadores para iniciar un torneo.');
    }

    sala.segundos = segundos || sala.segundos || 4;
    sala.powerUpsActivados = powerUpsActivados || sala.powerUpsActivados;
    sala.modoJuego = modo || sala.modoJuego;
    sala.modoTorneo = true;
    sala.tipoTorneo = tipoTorneo || 'simple';
    
    sala.torneo = {
      tipo: sala.tipoTorneo,
      rondaActual: 1,
      bracket: crearBracketTorneo(sala.jugadores),
      jugadoresActivos: sala.jugadores.map(j => j.id),
      campeon: null
    };
    
    io.to(codigo).emit('torneo_iniciado', {
      jugadores: sala.jugadores,
      rondas: sala.torneo.bracket.length
    });
    
    io.to(codigo).emit('bracket_actualizado', {
      bracket: sala.torneo.bracket
    });
    
    iniciarPartidaNormal(sala, 1);
  });

  function iniciarPartidaNormal(sala, ronda) {
    sala.enJuego = true;
    sala.indiceCarta = 0;
    sala.cartasCantadas = [];
    sala.mazo = crearMazoGarantizado(sala.jugadores);
    sala.ultimoUso = Date.now();

    io.to(sala.codigo).emit('juego_iniciado', { 
      modo: sala.modoJuego,
      totalJugadores: sala.jugadores.length,
      powerUpsActivados: sala.powerUpsActivados,
      ronda: ronda || null
    });

    io.to(sala.codigo).emit('barajeando');
    
    setTimeout(() => {
      emitirSiguienteCarta(sala.codigo);
    }, 5000);
  }

  function emitirSiguienteCarta(codigo) {
    const sala = salas[codigo];
    if (!sala || !sala.enJuego || sala.pausado) return;

    if (sala.indiceCarta < sala.mazo.length) {
      const carta = sala.mazo[sala.indiceCarta];
      sala.cartasCantadas.push(carta.id);
      sala.ultimoUso = Date.now();
      
      io.to(codigo).emit('nueva_carta', { 
        carta, 
        totalCantadas: sala.cartasCantadas.length,
        totalCartas: sala.mazo.length
      });
      
      sala.indiceCarta++;

      sala.intervalo = setTimeout(() => {
        emitirSiguienteCarta(codigo);
      }, sala.segundos * 1000);
    } else {
      if (sala.cartasCantadas.length > 0) {
        determinarGanadorAutomatico(codigo);
      } else {
        sala.enJuego = false;
        io.to(codigo).emit('fin_mazo');
      }
    }
  }

  function determinarGanadorAutomatico(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    if (sala.cartasCantadas.length === 0) {
      sala.enJuego = false;
      io.to(codigo).emit('fin_mazo');
      return;
    }
    
    sala.enJuego = false;
    
    let mejorJugador = null;
    let mejorPuntuacion = -1;
    
    sala.jugadores.forEach(jugador => {
      const cartasCantadasSet = new Set(sala.cartasCantadas);
      const cartasCoincidentes = (jugador.tabla || []).filter(id => cartasCantadasSet.has(id)).length;
      const porcentaje = cartasCoincidentes / 16;
      
      let puntuacion = cartasCoincidentes * 10;
      
      if (porcentaje >= 0.75) puntuacion += 50;
      if (porcentaje >= 0.5) puntuacion += 30;
      if (porcentaje >= 0.25) puntuacion += 10;
      
      jugador.cartasCoincidentes = cartasCoincidentes;
      jugador.porcentaje = porcentaje;
      
      if (puntuacion > mejorPuntuacion) {
        mejorPuntuacion = puntuacion;
        mejorJugador = jugador;
      }
    });
    
    if (mejorJugador && mejorJugador.cartasCoincidentes > 0) {
      declararGanador(sala, mejorJugador);
    } else {
      io.to(codigo).emit('fin_mazo');
    }
  }

  function declararGanador(sala, jugador) {
    jugador.victorias = (jugador.victorias || 0) + 1;
    jugador.puntuacion = (jugador.puntuacion || 0) + 100;
    
    if (sala.modoTorneo && sala.torneo) {
      actualizarBracketTorneo(sala, jugador);
    } else {
      io.to(sala.codigo).emit('declarar_ganador', { 
        ganador: jugador.nombre,
        modo: sala.modoJuego,
        cartasCoincidentes: jugador.cartasCoincidentes || 16,
        estadisticas: sala.jugadores.map(j => ({
          nombre: j.nombre,
          victorias: j.victorias,
          puntuacion: j.puntuacion,
          cartasCoincidentes: j.cartasCoincidentes || 0
        }))
      });
    }
  }

  function actualizarBracketTorneo(sala, ganador) {
    const bracket = sala.torneo.bracket;
    const rondaActual = sala.torneo.rondaActual;
    
    const partida = bracket.find(p => 
      p.ronda === rondaActual && 
      (p.jugador1 === ganador.id || p.jugador2 === ganador.id)
    );
    
    if (partida) {
      partida.ganador = ganador.id;
    }
    
    const partidasRonda = bracket.filter(p => p.ronda === rondaActual);
    const partidasCompletadas = partidasRonda.filter(p => p.ganador !== null);
    
    if (partidasCompletadas.length === partidasRonda.length) {
      const ganadores = partidasCompletadas.map(p => p.ganador);
      
      if (ganadores.length === 1) {
        const campeon = sala.jugadores.find(j => j.id === ganadores[0]);
        sala.torneo.campeon = campeon.nombre;
        
        io.to(sala.codigo).emit('torneo_actualizado', {
          campeon: campeon.nombre
        });
        sala.torneo = null;
        sala.modoTorneo = false;
      } else {
        sala.torneo.rondaActual++;
        const nuevaRonda = sala.torneo.rondaActual;
        
        for (let i = 0; i < ganadores.length; i += 2) {
          bracket.push({
            jugador1: ganadores[i],
            jugador2: ganadores[i + 1] || null,
            ganador: ganadores[i + 1] ? null : ganadores[i],
            ronda: nuevaRonda,
            bye: !ganadores[i + 1]
          });
        }
        
        io.to(sala.codigo).emit('torneo_actualizado', {
          rondas: nuevaRonda,
          jugadores: ganadores
        });
        
        io.to(sala.codigo).emit('declarar_ganador', {
          ganador: ganador.nombre,
          modo: sala.modoJuego,
          ronda: rondaActual,
          esFinal: false
        });
      }
    }
  }

  socket.on('siguiente_ronda', ({ codigo }) => {
    const sala = salas[codigo];
    if (!sala || socket.id !== sala.host || !sala.torneo) return;
    
    iniciarPartidaNormal(sala, sala.torneo.rondaActual);
  });

  socket.on('actualizar_progreso', ({ codigo, marcadas }) => {
    const sala = salas[codigo];
    if (!sala) return;
    
    const jugador = sala.jugadores.find(j => j.id === socket.id);
    if (jugador && !jugador.bloqueado) {
      jugador.marcadas = marcadas;
      sala.ultimoUso = Date.now();
      io.to(codigo).emit('progreso_jugadores', sala.jugadores);
    }
  });

  socket.on('usar_powerup', ({ codigo, tipo }) => {
    const sala = salas[codigo];
    if (!sala || !sala.enJuego || !sala.powerUpsActivados) return;
    
    const jugador = sala.jugadores.find(j => j.id === socket.id);
    if (!jugador) return;
    
    io.to(codigo).emit('powerup_usado', {
      jugador: jugador.nombre,
      tipo
    });
    
    switch(tipo) {
      case 'oraculo':
        if (sala.indiceCarta < sala.mazo.length) {
          const siguienteCarta = sala.mazo[sala.indiceCarta];
          io.to(socket.id).emit('mensaje_chat', { 
            sistema: true, 
            mensaje: `👁️ El Oráculo dice: La próxima carta es ${siguienteCarta.nombre} ${siguienteCarta.emoji || ''}`
          });
        }
        break;
        
      case 'firewall':
        jugador.escudoActivo = true;
        io.to(socket.id).emit('escudo_activado');
        setTimeout(() => {
          jugador.escudoActivo = false;
        }, 15000);
        break;
        
      case 'hacker':
        const rivales = sala.jugadores.filter(j => j.id !== socket.id);
        if (rivales.length > 0) {
          const victima = rivales.reduce((max, j) => j.marcadas > max.marcadas ? j : max, rivales[0]);
          if (!victima.escudoActivo) {
            io.to(victima.id).emit('recibir_ataque_hacker');
            io.to(codigo).emit('mensaje_chat', {
              sistema: true,
              mensaje: `👾 El Hacker atacó a ${victima.nombre}`
            });
          } else {
            io.to(codigo).emit('mensaje_chat', {
              sistema: true,
              mensaje: `🛡️ ${victima.nombre} bloqueó el ataque del Hacker`
            });
          }
        }
        break;
        
      case 'glitch':
        socket.to(codigo).emit('sufrir_glitch');
        io.to(codigo).emit('mensaje_chat', {
          sistema: true,
          mensaje: `🌀 ¡${jugador.nombre} lanzó un Glitch a todos!`
        });
        break;
        
      case 'apagon':
        socket.to(codigo).emit('sufrir_apagon');
        io.to(codigo).emit('mensaje_chat', {
          sistema: true,
          mensaje: `🌑 ¡${jugador.nombre} lanzó un Apagón!`
        });
        break;
    }
  });

  socket.on('ataque_bloqueado', ({ codigo }) => {
    const sala = salas[codigo];
    if (!sala) return;
    
    io.to(codigo).emit('mensaje_chat', {
      sistema: true,
      mensaje: '🛡️ Un jugador bloqueó un ataque con Firewall'
    });
  });

  socket.on('pausar_juego', ({ codigo }) => {
    const sala = salas[codigo];
    if (!sala || socket.id !== sala.host || !sala.enJuego) return;
    
    sala.pausado = true;
    clearTimeout(sala.intervalo);
    io.to(codigo).emit('juego_pausado');
  });

  socket.on('reanudar_juego', ({ codigo }) => {
    const sala = salas[codigo];
    if (!sala || socket.id !== sala.host || !sala.enJuego) return;
    
    sala.pausado = false;
    io.to(codigo).emit('juego_reanudado');
    emitirSiguienteCarta(codigo);
  });

  socket.on('cantar_loteria', ({ codigo }) => {
    const sala = salas[codigo];
    if (!sala || !sala.enJuego || sala.pausado) return;

    const jugador = sala.jugadores.find(j => j.id === socket.id);
    if (!jugador || !jugador.tabla || jugador.tabla.length !== 16) {
      return socket.emit('loteria_invalida', 'No se ha podido validar tu tabla.');
    }
    
    if (jugador.bloqueado) {
      return socket.emit('loteria_invalida', 'Estás bloqueado por un power-up enemigo.');
    }

    const gano = verificarVictoria(sala.modoJuego, jugador.tabla, sala.cartasCantadas);

    if (gano) {
      sala.enJuego = false;
      clearTimeout(sala.intervalo);
      
      declararGanador(sala, jugador);
    } else {
      socket.emit('loteria_invalida', '¡Buenas pero no caen! Aún no completas el patrón requerido.');
    }
  });

  socket.on('volver_al_lobby', ({ codigo }) => {
    const sala = salas[codigo];
    if (!sala || socket.id !== sala.host) return;
    
    sala.enJuego = false;
    sala.pausado = false;
    clearTimeout(sala.intervalo);
    sala.cartasCantadas = [];
    sala.jugadores.forEach(j => {
      j.marcadas = 0;
      j.tabla = [];
      j.bloqueado = false;
      j.escudoActivo = false;
      j.cartasCoincidentes = 0;
      j.porcentaje = 0;
    });
    sala.ultimoUso = Date.now();
    sala.torneo = null;
    sala.modoTorneo = false;
    sala.tipoTorneo = null;
    
    io.to(codigo).emit('ir_a_lobby');
    io.to(codigo).emit('progreso_jugadores', sala.jugadores);
  });

  socket.on('disconnect', () => {
    for (const codigo in salas) {
      const sala = salas[codigo];
      const jugadorDesconectado = sala.jugadores.find(j => j.id === socket.id);
      
      if (jugadorDesconectado) {
        sala.jugadores = sala.jugadores.filter(j => j.id !== socket.id);
        
        if (sala.jugadores.length === 0) {
          clearTimeout(sala.intervalo);
          delete salas[codigo];
        } else {
          if (socket.id === sala.host) {
            sala.host = sala.jugadores[0].id;
            sala.jugadores[0].esHost = true;
          }
          
          io.to(codigo).emit('actualizar_jugadores', sala.jugadores);
          io.to(codigo).emit('progreso_jugadores', sala.jugadores);
          io.to(codigo).emit('mensaje_chat', {
            sistema: true,
            mensaje: `${jugadorDesconectado.nombre} abandonó la sala`
          });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Servidor de Lotería de Cómputo activo en http://localhost:${PORT}`);
});