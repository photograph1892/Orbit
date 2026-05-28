import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "orbit.records.v1";
const USER_KEY = "orbit.user.v1";
const PLAYLIST_KEY = "orbit.playlists.v1";
const TRACK_DURATION = 30;
const DEVICE_IMAGE_SRC = `${import.meta.env.BASE_URL}orbit-device.png`;
const FRONT_FRAME_SRC = `${import.meta.env.BASE_URL}orbit-front-frame.png`;

const moods = [
  { id: "calm", label: "평온한", colorName: "Pale Blue", color: "#b9d7eb", title: "Slow Lake", tone: "calm ambient", notes: [196, 247, 294] },
  { id: "excited", label: "설레는", colorName: "Soft Orange", color: "#efb56f", title: "Bright Walk", tone: "light synth", notes: [261, 329, 392] },
  { id: "lonely", label: "쓸쓸한", colorName: "Gray Blue", color: "#8ea2b8", title: "Faded Window", tone: "slow piano", notes: [174, 220, 277] },
  { id: "warm", label: "따뜻한", colorName: "Warm Beige", color: "#d8bd95", title: "Warm Afternoon", tone: "soft acoustic", notes: [220, 277, 330] },
  { id: "dreamy", label: "몽환적인", colorName: "Violet Blue", color: "#8c91d8", title: "Holographic Dream", tone: "dream pad", notes: [185, 233, 311] }
];

const generateSteps = [
  "사진의 분위기를 분석하는 중",
  "소리의 질감을 감지하는 중",
  "기분 색상을 추출하는 중",
  "오늘의 AI BGM을 생성하는 중"
];

function readRecords() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return stored.map((record) => {
      const mood = moods.find((item) => item.id === record.mood?.id) || record.mood || moods[0];
      return { ...record, mood };
    });
  } catch {
    return [];
  }
}

function writeRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function readPlaylists() {
  try {
    return JSON.parse(localStorage.getItem(PLAYLIST_KEY)) || [];
  } catch {
    return [];
  }
}

function writePlaylists(playlists) {
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists));
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function encodeShare(playlist) {
  const compact = {
    id: playlist.id,
    title: playlist.title,
    owner: playlist.owner,
    date: playlist.date,
    tracks: playlist.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      date: track.date,
      cover: track.cover,
      mood: { id: track.mood?.id, label: track.mood?.label, colorName: track.mood?.colorName, color: track.mood?.color },
      soundLabel: track.soundLabel
    }))
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
}

function decodeShare(value) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  } catch {
    return null;
  }
}

function normalizeSharedRecord(record) {
  const mood = moods.find((item) => item.id === record.mood?.id) || moods[0];
  return {
    ...record,
    id: record.id || `shared-track-${Date.now()}-${Math.random()}`,
    date: record.date || formatDate(),
    mood: { ...mood, ...record.mood, notes: mood.notes },
    soundLabel: record.soundLabel || mood.tone
  };
}

function mergeRecords(incoming, existing) {
  const ids = new Set(existing.map((record) => record.id));
  return [...incoming.filter((record) => !ids.has(record.id)), ...existing];
}

function App() {
  const [user, setUser] = useState(() => localStorage.getItem(USER_KEY) || "");
  const [screen, setScreen] = useState("intro");
  const [photo, setPhoto] = useState("");
  const [recording, setRecording] = useState(false);
  const [soundCaptured, setSoundCaptured] = useState(false);
  const [selectedMood, setSelectedMood] = useState(moods[0]);
  const [step, setStep] = useState(0);
  const [records, setRecords] = useState(() => readRecords());
  const [playlists, setPlaylists] = useState(() => readPlaylists());
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [playlistTitle, setPlaylistTitle] = useState("My Orbit LP");
  const [shareMessage, setShareMessage] = useState("");
  const [activeRecord, setActiveRecord] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const audioRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const currentRecord = activeRecord || records[0];
  const shelfRecords = activePlaylist?.tracks?.length ? activePlaylist.tracks : records;
  const accent = activeRecord?.mood?.color || selectedMood.color;

  useEffect(() => writeRecords(records), [records]);
  useEffect(() => writePlaylists(playlists), [playlists]);
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      const graph = audioRef.current;
      if (graph?.audio) setProgress(graph.audio.currentTime || 0);
      else setProgress((value) => (value + 0.25) % TRACK_DURATION);
    }, 250);
    return () => clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get("shared");
    if (!shared) return;
    const imported = decodeShare(shared);
    if (!imported?.tracks?.length) return;
    const playlist = {
      id: imported.id || `shared-${Date.now()}`,
      title: imported.title || "Shared Orbit LP",
      owner: imported.owner || "Shared",
      date: imported.date || formatDate(),
      tracks: imported.tracks.map(normalizeSharedRecord)
    };
    setUser((prev) => prev || "Guest");
    localStorage.setItem(USER_KEY, "Guest");
    setPlaylists((prev) => [playlist, ...prev.filter((item) => item.id !== playlist.id)]);
    setRecords((prev) => mergeRecords(playlist.tracks, prev));
    setActivePlaylist(playlist);
    setActiveRecord(playlist.tracks[0]);
    setScreen("playlist");
  }, []);

  useEffect(() => {
    if (screen !== "generate") return;
    setStep(0);
    const timers = generateSteps.map((_, index) => setTimeout(() => setStep(index), index * 900));
    const done = setTimeout(() => {
      const mood = selectedMood;
      const entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        date: formatDate(),
        createdAt: Date.now(),
        cover: photo,
        title: mood.title,
        mood,
        soundLabel: mood.tone
      };
      setRecords((prev) => [entry, ...prev]);
      setActivePlaylist(null);
      setActiveRecord(entry);
      setScreen("result");
    }, 4300);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [screen, selectedMood, photo]);

  const startRecordFlow = () => {
    stopTone();
    setPlaying(false);
    stopRecording(false);
    setPhoto("");
    setSoundCaptured(false);
    setRecording(false);
    setSelectedMood(moods[0]);
    setActiveRecord(null);
    setScreen("capture");
  };

  const handlePhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  };

  const startRecording = () => {
    setRecording(true);
    setSoundCaptured(false);
    setRecordingSeconds(0);
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((seconds) => {
        if (seconds >= 9) {
          stopRecording(true);
          return 10;
        }
        return seconds + 1;
      });
    }, 1000);
  };

  const stopRecording = (captured = true) => {
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setRecording(false);
    if (captured) setSoundCaptured(true);
  };

  const playTone = (record, startAt = progress) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!record) return false;
    stopTone();
    if (window.Audio) {
      const audio = new Audio(createAmbientWav(record.mood));
      audio.loop = true;
      audio.volume = 0.38;
      audio.currentTime = Math.max(0, Math.min(startAt, TRACK_DURATION - 0.2));
      audio.play?.().catch(() => {});
      audioRef.current = { audio };
      window.__orbitAudioMode = "html-audio";
      setProgress(audio.currentTime);
      return true;
    }
    if (!AudioContext) return false;
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 1.2);
    master.connect(context.destination);

    const oscillators = record.mood.notes.map((freq, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = index === 0 ? "sine" : "triangle";
      osc.frequency.value = freq;
      gain.gain.value = 0.2 / (index + 1);
      osc.connect(gain).connect(master);
      osc.start();
      return osc;
    });
    audioRef.current = { context, master, oscillators };
    context.resume?.();
    window.__orbitAudioMode = "web-audio";
    setProgress(Math.max(0, Math.min(startAt, TRACK_DURATION)));
    return true;
  };

  const stopTone = () => {
    const graph = audioRef.current;
    if (!graph) return;
    if (graph.audio) {
      graph.audio.pause();
      graph.audio.src = "";
      audioRef.current = null;
      return;
    }
    try {
      graph.master.gain.exponentialRampToValueAtTime(0.0001, graph.context.currentTime + 0.35);
      graph.oscillators.forEach((osc) => osc.stop(graph.context.currentTime + 0.4));
      setTimeout(() => graph.context.close(), 500);
    } catch {
      graph.context.close?.();
    }
    audioRef.current = null;
  };

  const togglePlay = (record = currentRecord) => {
    if (!record) return;
    if (playing) {
      stopTone();
      setPlaying(false);
    } else {
      setPlaying(playTone(record));
    }
  };

  const openRecord = (record, autoplay = false) => {
    setProgress(0);
    const didStart = autoplay ? playTone(record, 0) : false;
    setActiveRecord(record);
    setScreen("result");
    setPlaying(didStart);
  };

  const seekTo = (next) => {
    const value = Math.max(0, Math.min(Number(next), TRACK_DURATION));
    setProgress(value);
    const graph = audioRef.current;
    if (graph?.audio) graph.audio.currentTime = value;
  };

  const jumpBy = (delta) => {
    const value = Math.max(0, Math.min(progress + delta, TRACK_DURATION));
    seekTo(value);
    if (playing && currentRecord && !audioRef.current?.audio) {
      setPlaying(playTone(currentRecord, value));
    }
  };

  const login = (name) => {
    const clean = name.trim() || "Orbit User";
    setUser(clean);
    localStorage.setItem(USER_KEY, clean);
    setScreen("intro");
  };

  const logout = () => {
    stopTone();
    setPlaying(false);
    setUser("");
    localStorage.removeItem(USER_KEY);
    setScreen("intro");
  };

  const savePlaylist = () => {
    if (!records.length) return;
    const playlist = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title: playlistTitle.trim() || `${user || "Orbit"} LP`,
      owner: user || "Orbit User",
      date: formatDate(),
      tracks: records.slice(0, 24)
    };
    setPlaylists((prev) => [playlist, ...prev]);
    setActivePlaylist(playlist);
    setShareMessage("플레이리스트가 저장됐습니다.");
  };

  const sharePlaylist = async (playlist = activePlaylist) => {
    const target = playlist || {
      id: `orbit-${Date.now()}`,
      title: playlistTitle.trim() || `${user || "Orbit"} LP`,
      owner: user || "Orbit User",
      date: formatDate(),
      tracks: records.slice(0, 24)
    };
    if (!target.tracks.length) {
      setShareMessage("공유할 LP가 아직 없습니다.");
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?shared=${encodeShare(target)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: target.title, text: "Orbit 플레이리스트를 공유합니다.", url });
        setShareMessage("공유 창을 열었습니다.");
        return;
      } catch {
        // Fall back to copy when the share sheet is dismissed or unsupported.
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
      setShareMessage("공유 링크가 복사됐습니다. 카톡에 붙여넣어 보낼 수 있어요.");
    } catch {
      setShareMessage(url);
    }
  };

  const deleteRecord = (recordId) => {
    stopTone();
    setPlaying(false);
    setRecords((prev) => prev.filter((record) => record.id !== recordId));
    setPlaylists((prev) => prev.map((playlist) => ({
      ...playlist,
      tracks: playlist.tracks.filter((record) => record.id !== recordId)
    })).filter((playlist) => playlist.tracks.length));
    setActivePlaylist((playlist) => playlist ? { ...playlist, tracks: playlist.tracks.filter((record) => record.id !== recordId) } : null);
    const next = records.find((record) => record.id !== recordId) || null;
    setActiveRecord(next);
    setScreen(next ? "replay" : "playlist");
  };

  const deletePlaylist = (playlistId) => {
    setPlaylists((prev) => prev.filter((playlist) => playlist.id !== playlistId));
    if (activePlaylist?.id === playlistId) setActivePlaylist(null);
  };

  const navTo = (target) => {
    if (target === "home") setScreen("intro");
    if (target === "record") startRecordFlow();
    if (target === "playlist") setScreen("playlist");
    if (target === "replay") setScreen("replay");
  };

  return (
    !user ? (
      <main className="app-shell" style={{ "--accent": accent }}>
        <ProductFrame>
          <section className="screen login-screen">
            <Login onLogin={login} />
          </section>
        </ProductFrame>
      </main>
    ) : (
    <main className="app-shell" style={{ "--accent": accent }}>
      <ProductFrame nav={<BottomNav active={screen} onNavigate={navTo} />}>
        <section className={`screen ${screen}`}>
          {screen === "intro" && <Intro onStart={startRecordFlow} records={shelfRecords} onOpen={openRecord} user={user} onLogout={logout} />}
          {screen === "capture" && <Capture photo={photo} onPhoto={handlePhoto} onNext={() => setScreen("sound")} />}
          {screen === "sound" && (
            <SoundRecord recording={recording} seconds={recordingSeconds} captured={soundCaptured} onRecord={startRecording} onStop={() => stopRecording(true)} onNext={() => setScreen("mood")} />
          )}
          {screen === "mood" && <MoodSelect selected={selectedMood} onSelect={setSelectedMood} onNext={() => setScreen("generate")} />}
          {screen === "generate" && <Generate step={step} mood={selectedMood} photo={photo} />}
          {screen === "result" && activeRecord && (
            <NowPlaying
              record={activeRecord}
              playing={playing}
              progress={progress}
              onPlay={() => togglePlay(activeRecord)}
              onReplay={() => setScreen("replay")}
              onSeek={seekTo}
              onJump={jumpBy}
              onDelete={() => deleteRecord(activeRecord.id)}
            />
          )}
          {screen === "playlist" && (
            <Archive
              records={shelfRecords}
              allRecords={records}
              playlists={playlists}
              activePlaylist={activePlaylist}
              playlistTitle={playlistTitle}
              shareMessage={shareMessage}
              onTitleChange={setPlaylistTitle}
              onSave={savePlaylist}
              onShare={sharePlaylist}
              onDeletePlaylist={deletePlaylist}
              onDeleteRecord={deleteRecord}
              onSelectPlaylist={(playlist) => {
                setActivePlaylist(playlist);
                setActiveRecord(playlist.tracks[0]);
              }}
              onOpen={(record) => openRecord(record, true)}
            />
          )}
          {screen === "replay" && (
            <Replay
              records={shelfRecords}
              record={currentRecord}
              playing={playing}
              progress={progress}
              onOpen={openRecord}
              onPlay={() => togglePlay(currentRecord)}
              onJump={jumpBy}
              onSeek={seekTo}
              onDelete={(id) => deleteRecord(id || currentRecord?.id)}
            />
          )}
        </section>
      </ProductFrame>
    </main>
    )
  );
}

function ProductFrame({ children, nav }) {
  return (
    <div className="product-stage">
      <div className="device-window">
        {children}
      </div>
      <img className="product-frame" src={FRONT_FRAME_SRC} alt="Orbit front device frame" />
      {nav}
    </div>
  );
}

function createAmbientWav(mood) {
  const notes = mood.notes || moods[0].notes;
  const sampleRate = 16000;
  const duration = TRACK_DURATION;
  const samples = sampleRate * duration;
  const dataBytes = samples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const fadeIn = Math.min(1, time / 0.35);
    const fadeOut = Math.min(1, (duration - time) / 0.65);
    const envelope = Math.min(fadeIn, fadeOut) * 0.34;
    const beat = Math.sin(2 * Math.PI * time * (mood.id === "excited" ? 2.2 : mood.id === "warm" ? 1.15 : 0.45));
    const pulse = mood.id === "lonely" ? Math.max(0.2, Math.sin(time * 1.1) ** 2) : mood.id === "excited" ? 0.58 + Math.max(0, beat) * 0.42 : 0.86;
    const shimmer = mood.id === "dreamy" ? Math.sin(2 * Math.PI * (notes[2] * 2.01) * time + Math.sin(time * 2.4)) * 0.16 : 0;
    const pluck = mood.id === "warm" ? Math.exp(-(time % 1.25) * 4.5) * Math.sin(2 * Math.PI * notes[1] * 1.5 * time) * 0.35 : 0;
    const value = (notes.reduce((sum, note, noteIndex) => {
      const driftRate = mood.id === "dreamy" ? 1.7 : mood.id === "calm" ? 0.18 : 0.55;
      const slowDrift = Math.sin(time * driftRate + noteIndex) * (mood.id === "lonely" ? 0.25 : 0.9);
      const voice = Math.sin(2 * Math.PI * (note + slowDrift) * time);
      const secondVoice = mood.id === "excited" ? Math.sin(2 * Math.PI * (note * 2) * time) * 0.18 : 0;
      return sum + (voice + secondVoice) / (noteIndex + 1.6);
    }, 0) + shimmer + pluck) * envelope * pulse;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, value)) * 32767, true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function Login({ onLogin }) {
  const [name, setName] = useState("");

  return (
    <div className="login-wrap">
      <div className="top-caption">
        <span>ORBIT PRIVATE LP</span>
        <span>sign in</span>
      </div>
      <div className="login-copy">
        <h1>Orbit</h1>
        <p>내 하루의 사진, 소리, 기분을 개인 LP 책장에 저장하세요.</p>
      </div>
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(name);
        }}
      >
        <label>
          <span>프로필 이름</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: Jiwon" />
        </label>
        <button className="primary-button" type="submit">내 Orbit 들어가기</button>
      </form>
    </div>
  );
}

function Intro({ onStart, records, onOpen, user, onLogout }) {
  return (
    <div className="intro-wrap editorial">
      <div className="top-caption">
        <span>{user}'s AI MOMENT LP</span>
        <button className="caption-button" onClick={onLogout}>logout</button>
      </div>
      <h1>Orbit</h1>
      <p className="big-sub">기억의 궤도를 재생하다</p>
      <AlbumCarousel records={records} onOpen={onOpen} mode="hero" />
      <div className="intro-copy">
        <p className="kicker">record time, play Orbit</p>
        <p>사진, 소리, 기분을 기록하면 AI가 하루의 분위기를 BGM으로 만듭니다.</p>
      </div>
      <button className="primary-button" onClick={onStart}>오늘 기록 시작하기</button>
    </div>
  );
}

function Capture({ photo, onPhoto, onNext }) {
  return (
    <div className="flow-panel">
      <Header eyebrow="01 Capture" title="오늘 기억하고 싶은 장면을 선택하세요." />
      <div className={`cover-orbit ${photo ? "has-photo" : ""}`}>
        {photo ? <img src={photo} alt="선택한 오늘의 장면" /> : <span>사진, 소리, 기분</span>}
      </div>
      <div className="button-row">
        <label className="secondary-button">
          사진 선택
          <input type="file" accept="image/*" onChange={onPhoto} />
        </label>
        <button className="primary-button compact" onClick={onNext} disabled={!photo}>다음</button>
      </div>
    </div>
  );
}

function SoundRecord({ recording, seconds, captured, onRecord, onStop, onNext }) {
  return (
    <div className="flow-panel">
      <Header eyebrow="02 Sound" title="그 순간의 소리를 함께 기록하세요." />
      <div className={`wave-card ${recording ? "recording" : ""} ${captured ? "captured" : ""}`}>
        <div className="mic-ring"><Icon name={captured ? "check" : "mic"} /></div>
        <div className="waveform" aria-hidden="true">
          {Array.from({ length: 28 }).map((_, index) => <i key={index} style={{ "--i": index }} />)}
        </div>
        <p>{captured ? "Sound captured" : recording ? `Recording 00:${String(seconds).padStart(2, "0")} / 00:10` : "Tap to collect the room tone"}</p>
      </div>
      <div className="button-row">
        <button className="secondary-button" onClick={recording ? onStop : onRecord}>{recording ? "녹음 끊기" : "녹음 시작"}</button>
        <button className="primary-button compact" onClick={onNext} disabled={!captured}>녹음 완료</button>
      </div>
    </div>
  );
}

function MoodSelect({ selected, onSelect, onNext }) {
  return (
    <div className="flow-panel">
      <Header eyebrow="03 Mood" title="오늘의 기분을 선택하세요." />
      <div className="mood-grid">
        {moods.map((mood) => (
          <button key={mood.id} className={`mood-chip ${selected.id === mood.id ? "selected" : ""}`} style={{ "--mood": mood.color }} onClick={() => onSelect(mood)}>
            <span className="mood-ring" />
            <span>{mood.label}</span>
            <small>{mood.colorName}</small>
          </button>
        ))}
      </div>
      <div className="selected-strip">
        <span style={{ background: selected.color }} />
        <b>{selected.title}</b>
        <em>{selected.tone}</em>
      </div>
      <button className="primary-button" onClick={onNext}>AI BGM 생성하기</button>
    </div>
  );
}

function Generate({ step, mood, photo }) {
  return (
    <div className="generate-wrap" style={{ "--accent": mood.color }}>
      <div className="generate-orbit">
        {photo && <img src={photo} alt="" />}
        <span />
        <span />
        <span />
      </div>
      <div className="step-list">
        {generateSteps.map((label, index) => <p key={label} className={index <= step ? "visible" : ""}>{label}</p>)}
      </div>
    </div>
  );
}

function NowPlaying({ record, playing, progress, onPlay, onReplay, onSeek, onJump, onDelete }) {
  return (
    <div className="player-screen">
      <div className="player-title">
        <span>AI MOMENT LP ARCHIVE</span>
        <h1>rP-LP</h1>
      </div>
      <div className="lp-console">
        <div className="console-meta">
          <span>MP3 device synced</span>
          <span>{record.date}</span>
        </div>
        <div className={`record-disc ${playing ? "playing" : ""}`} style={{ "--accent": record.mood.color }}>
          <span className="grooves" />
          {record.cover ? <img src={record.cover} alt={record.title} /> : <span className="disc-label" />}
          <strong>{record.title}</strong>
          <em>AI BGM</em>
        </div>
        <div className="lp-controls">
          <div className="timeline seek-timeline">
            <b>{formatTime(progress)}</b>
            <input
              type="range"
              min="0"
              max={TRACK_DURATION}
              step="0.1"
              value={progress}
              onChange={(event) => onSeek(event.target.value)}
              aria-label="재생 위치"
            />
            <b>-{formatTime(TRACK_DURATION - progress)}</b>
          </div>
          <div className="transport">
            <button aria-label="previous" onClick={() => onJump(-10)}><Icon name="prev" /></button>
            <button className="play-main" onClick={onPlay} aria-label="play"><Icon name={playing ? "pause" : "play"} /></button>
            <button aria-label="next" onClick={() => onJump(10)}><Icon name="next" /></button>
          </div>
          <div className="player-actions">
            <button className="text-button" onClick={onReplay}>Replay</button>
            <button className="trash-button" onClick={onDelete} aria-label="삭제"><Icon name="trash" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(value) {
  const safe = Math.max(0, Math.floor(value || 0));
  return `0:${String(safe).padStart(2, "0")}`;
}

function Archive({
  records,
  allRecords,
  playlists,
  activePlaylist,
  playlistTitle,
  shareMessage,
  onTitleChange,
  onSave,
  onShare,
  onDeletePlaylist,
  onDeleteRecord,
  onSelectPlaylist,
  onOpen
}) {
  return (
    <div className="archive-wrap">
      <div className="top-caption">
        <span>AI MOMENT LP ARCHIVE</span>
        <span>{records.length}장의 LP</span>
      </div>
      <h1>Scroll</h1>
      <AlbumCarousel records={records} onOpen={onOpen} onDelete={onDeleteRecord} mode="archive" />
      <div className="playlist-builder">
        <label>
          <span>플레이리스트 제목</span>
          <input value={playlistTitle} onChange={(event) => onTitleChange(event.target.value)} placeholder="My Orbit LP" />
        </label>
        <button className="secondary-button" onClick={onSave} disabled={!allRecords.length}>저장</button>
      </div>
      {playlists.length > 0 && (
        <div className="playlist-list">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className={activePlaylist?.id === playlist.id ? "selected" : ""}
            >
              <button onClick={() => onSelectPlaylist(playlist)}>
                <span>{playlist.title}</span>
                <small>{playlist.tracks.length} LP · {playlist.owner}</small>
              </button>
              <button className="trash-button small" onClick={() => onDeletePlaylist(playlist.id)} aria-label={`${playlist.title} 삭제`}>
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="archive-panel">
        <div>
          <b>{activePlaylist?.title || "LP 책장"}</b>
          <span>{records.length ? "표지를 누르면 이 플레이리스트가 바로 재생됩니다." : "오늘의 첫 AI BGM을 기록해보세요."}</span>
        </div>
        <button className="share-button" onClick={() => onShare(activePlaylist)}>카톡/공유</button>
      </div>
      {shareMessage && <p className="share-message">{shareMessage}</p>}
    </div>
  );
}

function Replay({ records, record, playing, progress, onOpen, onPlay, onJump, onSeek, onDelete }) {
  return (
    <div className="replay-wrap">
      <div className="top-caption">
        <span>Replay</span>
        <span>{records.length} saved</span>
      </div>
      <h1>Orbit Device</h1>
      <div className="device-replay-stage">
        <OrbitDevice
          record={record}
          playing={playing}
          progress={progress}
          onPlay={onPlay}
          onJump={onJump}
          onSeek={onSeek}
        />
        <AlbumCarousel records={records} onOpen={(next) => onOpen(next, true)} onDelete={(id) => onDelete(id)} mode="device" />
      </div>
      <div className="replay-dock">
        <div>
          <b>{record ? record.title : "No record selected"}</b>
          <span>{record ? `${record.mood.label} · ${record.mood.colorName}` : "저장된 LP를 클릭하면 재생 화면으로 이동합니다."}</span>
        </div>
        <div className="dock-actions">
          <button className="trash-button" onClick={onDelete} disabled={!record} aria-label="삭제"><Icon name="trash" /></button>
          <button className="round-button" onClick={onPlay} disabled={!record} aria-label="Replay">
            <Icon name={playing ? "pause" : "play"} />
          </button>
        </div>
      </div>
    </div>
  );
}

function OrbitDevice({ record, playing, progress, onPlay, onJump, onSeek }) {
  const mood = record?.mood || moods[0];
  return (
    <div className={`orbit-device ${playing ? "is-playing" : ""}`} style={{ "--accent": mood.color }}>
      <div className="device-screen">
        {record ? (
          <div className="device-app">
            <div className="device-status">
              <span>Orbit</span>
              <span>AI BGM</span>
            </div>
            <div className={`device-disc ${playing ? "playing" : ""}`}>
              {record.cover ? <img src={record.cover} alt="" /> : <span />}
            </div>
            <div className="device-track">
              <b>{record.title}</b>
              <span>{record.mood.label} ? {record.mood.colorName}</span>
            </div>
            <input
              className="device-seek"
              type="range"
              min="0"
              max={TRACK_DURATION}
              step="0.1"
              value={progress}
              onChange={(event) => onSeek(event.target.value)}
              aria-label="Orbit device seek"
            />
          </div>
        ) : (
          <div className="device-empty">
            <b>Orbit</b>
            <span>Select an LP</span>
          </div>
        )}
      </div>
      <img className="device-shell" src={DEVICE_IMAGE_SRC} alt="Orbit home device" />
      <button className="device-hit device-prev" onClick={() => onJump(-10)} disabled={!record} aria-label="Previous" />
      <button className="device-hit device-play" onClick={onPlay} disabled={!record} aria-label={playing ? "Pause" : "Play"} />
      <button className="device-hit device-next" onClick={() => onJump(10)} disabled={!record} aria-label="Next" />
    </div>
  );
}

function AlbumCarousel({ records, onOpen, onDelete, mode }) {
  const [angle, setAngle] = useState(0);
  const dragRef = useRef({ dragging: false, startX: 0, startAngle: 0, moved: 0 });
  const visibleRecords = records.slice(0, 24);
  const count = Math.max(visibleRecords.length, 1);
  const radius = Math.min(360, 92 + count * 8);

  const onPointerDown = (event) => {
    dragRef.current = { dragging: true, startX: event.clientX, startAngle: angle, moved: 0, wasDrag: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag.dragging) return;
    const delta = event.clientX - drag.startX;
    drag.moved = Math.abs(delta);
    drag.wasDrag = drag.moved > 8;
    setAngle(drag.startAngle + delta * 0.45);
  };

  const onPointerUp = () => {
    dragRef.current.dragging = false;
  };

  const openIfClick = (record) => {
    if (dragRef.current.wasDrag) {
      setTimeout(() => {
        dragRef.current.wasDrag = false;
        dragRef.current.moved = 0;
      }, 0);
      return;
    }
    onOpen(record);
  };

  const openFromPointer = (event) => {
    const card = event.target.closest?.(".album-card");
    if (!card || dragRef.current.wasDrag) return;
    const index = Number(card.dataset.index);
    const record = visibleRecords[index];
    if (record) onOpen(record);
  };

  if (!visibleRecords.length) {
    return (
      <div className={`album-carousel empty ${mode}`}>
        <div className="empty-arc">
          {Array.from({ length: 7 }).map((_, index) => {
            const offset = index - 3;
            return <span key={index} style={{ "--offset": offset, "--rise": Math.abs(offset) }} />;
          })}
        </div>
        <p>LP가 저장되면 이곳에 하나씩 꽂힙니다.</p>
      </div>
    );
  }

  return (
    <div
      className={`album-carousel ${mode}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        onPointerUp();
        openFromPointer(event);
      }}
      onPointerCancel={onPointerUp}
    >
      <div className="carousel-stage" style={{ "--angle": `${angle}deg`, "--radius": `${radius}px` }}>
        {visibleRecords.map((record, index) => {
          const spread = visibleRecords.length < 6 ? 32 : 360 / visibleRecords.length;
          const itemAngle = index * spread - (spread * (visibleRecords.length - 1)) / 2;
          return (
            <button
              key={record.id}
              data-index={index}
              className="album-card"
              style={{ "--item-angle": `${itemAngle}deg`, "--accent": record.mood.color }}
              onClick={() => openIfClick(record)}
            >
              {record.cover ? <img src={record.cover} alt="" /> : <span />}
              <i />
              {onDelete && (
                <em
                  className="card-trash"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(record.id);
                  }}
                >
                  <Icon name="trash" />
                </em>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Header({ eyebrow, title }) {
  return (
    <header className="section-header">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
    </header>
  );
}

function BottomNav({ active, onNavigate }) {
  const items = [
    ["home", "Home", "home"],
    ["record", "Record", "plus"],
    ["playlist", "Playlist", "list"],
    ["replay", "Replay", "orbit"]
  ];
  return (
    <nav className="bottom-nav">
      {items.map(([id, label, icon]) => (
        <button key={id} className={isNavActive(active, id) ? "active" : ""} onClick={() => onNavigate(id)}>
          <Icon name={icon} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function isNavActive(screen, id) {
  if (id === "home") return screen === "intro";
  if (id === "record") return ["capture", "sound", "mood", "generate", "result"].includes(screen);
  if (id === "playlist") return screen === "playlist";
  if (id === "replay") return screen === "replay";
  return false;
}

function Icon({ name }) {
  const common = { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M6.5 10.5V20h11v-9.5" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    list: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>,
    orbit: <><circle cx="12" cy="12" r="3" /><path d="M3 12c2.2-6 15.8-6 18 0" /><path d="M21 12c-2.2 6-15.8 6-18 0" /></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>,
    check: <path d="m5 12 4 4 10-10" />,
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
    prev: <><path d="m11 7-5 5 5 5" /><path d="m18 7-5 5 5 5" /></>,
    next: <><path d="m6 7 5 5-5 5" /><path d="m13 7 5 5-5 5" /></>,
    trash: <><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" /></>
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export default App;
