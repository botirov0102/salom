/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import { socket } from './services/socket';
import { Player } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Car, Palette, User, ChevronRight, ChevronLeft, Shield } from 'lucide-react';

const CAR_TYPES = [
  { id: 'sport', name: 'Sport GT', description: 'Fast & Agile', stat: 'Speed' },
  { id: 'truck', name: 'Off-Road', description: 'Stable & Tough', stat: 'Grip' },
  { id: 'classic', name: 'Vintage', description: 'Style & Drift', stat: 'Style' },
] as const;

const COLORS = [
  'hsl(0, 70%, 50%)',
  'hsl(210, 70%, 50%)',
  'hsl(120, 70%, 50%)',
  'hsl(60, 70%, 50%)',
  'hsl(280, 70%, 50%)',
  'hsl(30, 70%, 50%)',
  'hsl(180, 70%, 50%)',
  'hsl(330, 70%, 50%)',
];

const TRACK_THEMES = [
  { id: 'night_city', name: 'Night City', color: '#ff00ff', desc: 'Neon Cyberpunk' },
  { id: 'desert_outpost', name: 'Desert Outpost', color: '#ffaa00', desc: 'Dusty Canyon' },
  { id: 'ice_glacier', name: 'Ice Glacier', color: '#00ffff', desc: 'Frozen Tundra' },
] as const;

export default function App() {
  const [view, setView] = useState<'landing' | 'lobby' | 'game'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [isHost, setIsHost] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const [trackTheme, setTrackTheme] = useState<'night_city' | 'desert_outpost' | 'ice_glacier'>('night_city');
  const [error, setError] = useState('');

  useEffect(() => {
    socket.on('roomCreated', ({ roomId, players, trackTheme, isHost }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setTrackTheme(trackTheme);
      setIsHost(isHost);
      setView('lobby');
      setError('');
    });

    socket.on('roomJoined', ({ roomId, players, trackTheme, isHost, isSpectator, status }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setTrackTheme(trackTheme);
      setIsHost(isHost);
      setIsSpectator(!!isSpectator);
      if (isSpectator && status === 'racing') {
        setView('game');
      } else {
        setView('lobby');
      }
      setError('');
    });

    socket.on('playerJoinedRoom', (player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('playerUpdated', (player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('trackUpdated', (theme) => {
      setTrackTheme(theme);
    });

    socket.on('playerDisconnected', (id) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on('gameStarted', ({ players: initialPlayers, trackTheme: finalTheme }) => {
      setPlayers(initialPlayers);
      setTrackTheme(finalTheme);
      setView('game');
    });

    socket.on('error', (msg) => {
      setError(msg);
    });
    
    socket.on('hostMigrated', (newHostId) => {
        if (socket.id === newHostId) {
            setIsHost(true);
        }
    });

    return () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('playerJoinedRoom');
      socket.off('playerUpdated');
      socket.off('playerDisconnected');
      socket.off('gameStarted');
      socket.off('error');
      socket.off('hostMigrated');
    };
  }, []);

  const handleCreate = () => {
    socket.emit('createRoom');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || joinCode.length !== 6) {
        setError('Please enter a valid 6-character room code');
        return;
    }
    socket.emit('joinRoom', { roomId: joinCode.toUpperCase() });
  };

  const handleSpectate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || joinCode.length !== 6) {
        setError('Please enter a valid 6-character room code');
        return;
    }
    socket.emit('spectateRoom', { roomId: joinCode.toUpperCase() });
  };

  const handleStartGame = () => {
    socket.emit('startGame');
  };

  const updateSetting = (key: string, value: string) => {
      socket.emit('updateSettings', { [key]: value });
  };

  const currentPlayer = players[socket.id || ''];

  return (
    <div className={`min-h-screen bg-[#050505] text-slate-100 font-sans selection:bg-orange-500/30 overflow-x-hidden`}>
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-600/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <header className={`relative z-10 w-full max-w-7xl mx-auto ${view === 'game' ? 'p-2' : 'p-8'} flex justify-between items-center transition-all`}>
        <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex items-center gap-3"
        >
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-yellow-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20 transform -rotate-6">
                <Car className="text-black w-6 h-6" />
            </div>
            <h1 className={`${view === 'game' ? 'text-xl' : 'text-3xl'} font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 transform -skew-x-12`}>
                ASROR<span className="text-orange-500">.BOTIROV</span>
            </h1>
        </motion.div>

        {view === 'game' && (
            <div className="flex items-center gap-4">
                 <div className="bg-slate-900/50 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/5 text-xs font-mono text-slate-400">
                    ID: {roomCode}
                </div>
            </div>
        )}
      </header>

      <main className={`relative z-10 flex-1 w-full flex flex-col items-center ${view === 'game' ? 'p-0' : 'p-4'}`}>
        <AnimatePresence mode="wait">
        {view === 'landing' && (
          <motion.div 
            key="landing"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="glass p-10 rounded-3xl shadow-2xl max-w-md w-full mt-10"
          >
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold tracking-tight mb-2">Initialize Engine</h2>
                <p className="text-slate-400 text-sm">Join the underground racing circuit.</p>
            </div>
            
            <div className="space-y-6">
              {error && (
                <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="text-red-400 text-xs text-center bg-red-900/20 border border-red-500/20 py-2.5 rounded-xl"
                >
                    {error}
                </motion.div>
              )}

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={handleCreate}
                  className="group relative w-full bg-white text-black font-black py-4 rounded-2xl shadow-xl hover:shadow-orange-500/10 transition-all active:scale-95 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="relative z-10 flex items-center justify-center gap-2">
                      CREATE RACE <ChevronRight className="w-5 h-5" />
                  </span>
                </button>
                
                <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/5"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] font-bold">
                        <span className="px-4 bg-[#0a0a0a] text-slate-500">Manual Entry</span>
                    </div>
                </div>

                    <form onSubmit={handleJoin} className="space-y-3">
                        <div className="group relative">
                            <input
                                type="text"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white uppercase tracking-[0.4em] font-mono text-xl text-center focus:border-orange-500/50 outline-none transition-all placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                                placeholder="6-DIGIT CODE"
                                maxLength={6}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="submit"
                                className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 border border-white/5"
                            >
                                JOIN
                            </button>
                            <button
                                type="button"
                                onClick={handleSpectate}
                                className="bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 border border-white/10"
                            >
                                SPECTATE
                            </button>
                        </div>
                    </form>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'lobby' && (
            <motion.div 
                key="lobby"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.05, opacity: 0 }}
                className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mt-4 mb-20"
            >
                {/* Left Column: Player Customization */}
                {!isSpectator ? (
                    <div className="lg:col-span-8 space-y-6">
                        <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
                            <div className="flex items-center gap-4 mb-10">
                                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                                    <Palette className="w-6 h-6 text-orange-500" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black italic tracking-tighter uppercase italic">The Garage</h2>
                                    <p className="text-slate-400 text-xs font-bold tracking-widest uppercase opacity-50">Specify your vehicle</p>
                                </div>
                            </div>

                        {/* Name Input */}
                        <div className="mb-10">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 block">Racer Identity</label>
                            <div className="relative group">
                                <User className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-orange-500 transition-colors" />
                                <input 
                                    type="text"
                                    value={currentPlayer?.name || ''}
                                    onChange={(e) => updateSetting('name', e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 pl-14 pr-6 font-bold focus:border-orange-500/50 outline-none transition-all"
                                    placeholder="Enter your handle..."
                                />
                            </div>
                        </div>

                        {/* Car Type Selection */}
                        <div className="mb-10">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4 block">Vehicle Class</label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {CAR_TYPES.map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => updateSetting('carType', type.id)}
                                        className={`relative group p-6 rounded-[2rem] border transition-all text-left overflow-hidden ${
                                            currentPlayer?.carType === type.id 
                                            ? 'bg-white border-white' 
                                            : 'bg-black/20 border-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        <div className={`text-xs font-black uppercase tracking-wider mb-1 ${
                                            currentPlayer?.carType === type.id ? 'text-black/40' : 'text-slate-500'
                                        }`}>
                                            {type.stat} Model
                                        </div>
                                        <div className={`text-xl font-black tracking-tight mb-2 ${
                                            currentPlayer?.carType === type.id ? 'text-black' : 'text-white'
                                        }`}>
                                            {type.name}
                                        </div>
                                        <div className={`text-[10px] leading-relaxed ${
                                            currentPlayer?.carType === type.id ? 'text-black/60' : 'text-slate-400'
                                        }`}>
                                            {type.description}
                                        </div>
                                        {currentPlayer?.carType === type.id && (
                                            <motion.div layoutId="carHighlight" className="absolute top-4 right-4 w-2 h-2 bg-orange-600 rounded-full" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Color Selection */}
                        <div className="mb-10">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4 block">Paint Shop</label>
                            <div className="flex flex-wrap gap-4">
                                {COLORS.map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => updateSetting('color', color)}
                                        className={`w-12 h-12 rounded-2xl border-4 transition-all transform hover:scale-110 active:scale-95 ${
                                            currentPlayer?.color === color ? 'border-white scale-110 shadow-lg shadow-white/10' : 'border-transparent'
                                        }`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Track Theme Selection (Host Only or Visible to all) */}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4 block">Event Location {!isHost && "(Host Choice)"}</label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {TRACK_THEMES.map((theme) => (
                                    <button
                                        key={theme.id}
                                        disabled={!isHost}
                                        onClick={() => updateSetting('trackTheme', theme.id)}
                                        className={`relative p-5 rounded-2xl border transition-all text-left ${
                                            trackTheme === theme.id 
                                            ? 'bg-slate-100 border-white text-black' 
                                            : 'bg-white/5 border-white/5 text-white hover:border-white/10 disabled:opacity-50'
                                        }`}
                                    >
                                        <div className="text-xl font-black italic tracking-tighter mb-1">{theme.name}</div>
                                        <div className={`text-[10px] font-bold uppercase tracking-widest ${trackTheme === theme.id ? 'text-black/50' : 'text-slate-500'}`}>{theme.desc}</div>
                                        {trackTheme === theme.id && (
                                            <motion.div layoutId="themeDot" className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-orange-600" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                ) : (
                    <div className="lg:col-span-8 flex flex-col items-center justify-center p-20 bg-slate-900/20 backdrop-blur-3xl rounded-[3rem] border border-white/5 text-center my-auto">
                        <div className="w-20 h-20 bg-orange-600/20 rounded-full flex items-center justify-center mb-6 border border-orange-500/30">
                           <Shield className="w-10 h-10 text-orange-500" />
                        </div>
                        <h2 className="text-4xl font-black italic tracking-tighter mb-4">SPECTATOR VIEW</h2>
                        <p className="text-slate-400 max-w-sm">You are currently observing this race. You will be able to watch the action once the host ignites the engines.</p>
                        
                        <div className="mt-12 flex gap-4">
                            <div className="bg-white/5 px-6 py-3 rounded-2xl border border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                STATUS: AWAITING START
                            </div>
                        </div>
                    </div>
                )}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
                        <div className="text-center mb-8 border-b border-white/5 pb-8">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-500 mb-3">Entrance Key</h2>
                            <div className="text-4xl font-mono font-black tracking-[0.2em] text-orange-500">
                                {roomCode}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest flex justify-between items-center px-2">
                                <span>Race Grid</span>
                                <span className="bg-white/5 px-3 py-1 rounded-full text-[10px] text-slate-400 border border-white/10">
                                    {Object.keys(players).length} / 8
                                </span>
                            </h3>
                            
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {Object.values(players).map(p => (
                                    <motion.div 
                                        key={p.id}
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="bg-black/20 px-4 py-4 rounded-2xl flex items-center gap-4 border border-white/5"
                                    >
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold" style={{ backgroundColor: p.color, color: 'rgba(0,0,0,0.5)' }}>
                                                {p.name.charAt(0).toUpperCase()}
                                            </div>
                                            {p.id === roomCode && (
                                                <div className="absolute -top-1 -right-1 bg-yellow-500 text-black p-0.5 rounded-md">
                                                    <Shield size={10} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold truncate text-sm flex items-center gap-2">
                                                {p.name}
                                                {p.id === socket.id && <span className="text-[8px] bg-white/10 px-1.5 py-0.5 rounded text-white/40 uppercase tracking-tighter">YOU</span>}
                                            </div>
                                            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                                                {p.carType}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-8">
                            {isHost ? (
                                <button
                                    onClick={handleStartGame}
                                    className="group w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-orange-600/20 transition-all active:scale-95 flex items-center justify-center gap-3 text-lg italic tracking-tighter"
                                >
                                    IGNITE ENGINES <ChevronRight className="w-6 h-6" />
                                </button>
                            ) : (
                                <div className="text-center py-4 px-6 bg-white/5 rounded-2xl border border-white/5 text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse">
                                    Awaiting Host Synchronization...
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        )}

        {view === 'game' && (
          <motion.div 
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full"
          >
            <GameCanvas initialPlayers={players} theme={trackTheme} isSpectator={isSpectator} />
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none opacity-20 text-[10px] uppercase font-bold tracking-[0.4em] text-white flex items-center gap-4">
          <span>AI POWERED ENGINE</span>
          <div className="w-1 h-1 bg-white rounded-full"></div>
          <span>REALTIME SYNC</span>
      </footer>
    </div>
  );
}
