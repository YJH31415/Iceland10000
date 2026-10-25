import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import {
  CITIES, DEFAULT_SETTINGS, VOLCANO, advanceParticles, cityIndicators, exportCSV,
  getStats, particlesToGeoJSON, seedParticles, type Particle, type Settings,
} from './simulation';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const SPEEDS = [1, 5, 10, 50, 100, 500];

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function formatMass(value: number) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} Gt`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} Mt`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} kt`;
  return `${value.toFixed(0)} kg`;
}

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const particlesRef = useRef<Particle[]>(seedParticles(DEFAULT_SETTINGS));
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const elapsedRef = useRef(0);
  const lastFrameRef = useRef(0);
  const accumulatorRef = useRef(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [particles, setParticles] = useState<Particle[]>(particlesRef.current);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [showWind, setShowWind] = useState(true);
  const [showCities, setShowCities] = useState(true);
  const [snapshot, setSnapshot] = useState<{ time: number; active: number; maxDistanceKm: number }[]>([]);
  const [notice, setNotice] = useState('합성 바람장 · 연구/교육용');

  const stats = useMemo(() => getStats(particles, elapsed), [particles, elapsed]);
  const cityData = useMemo(() => cityIndicators(particles), [particles]);

  const syncMap = useCallback((current: Particle[]) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource('ash-particles') as GeoJSONSource | undefined;
    source?.setData(particlesToGeoJSON(current));
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [-10, 58],
      zoom: 3.1,
      minZoom: 1.5,
      maxZoom: 8,
      projection: { type: 'globe' },
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', () => {
      map.addSource('ash-particles', { type: 'geojson', data: particlesToGeoJSON(particlesRef.current) });
      map.addLayer({
        id: 'ash-particles-glow',
        type: 'circle',
        source: 'ash-particles',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.5, 5, 4, 8, 6],
          'circle-color': '#ffb65e',
          'circle-opacity': 0.7,
          'circle-blur': 0.45,
        },
      });
      map.addLayer({
        id: 'ash-particles-core',
        type: 'circle',
        source: 'ash-particles',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 5, 1.8, 8, 2.8],
          'circle-color': '#ffe0a8',
          'circle-opacity': 0.85,
        },
      });
      map.addSource('volcano', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [VOLCANO.lon, VOLCANO.lat] }, properties: {} },
      });
      map.addLayer({
        id: 'volcano-point',
        type: 'circle',
        source: 'volcano',
        paint: { 'circle-radius': 6, 'circle-color': '#ff5f5f', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      });
      map.addLayer({
        id: 'volcano-label',
        type: 'symbol',
        source: 'volcano',
        layout: { 'text-field': 'EYJAFJALLAJÖKULL', 'text-offset': [0, 1.35], 'text-size': 11, 'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#ffd2d2', 'text-halo-color': '#111827', 'text-halo-width': 1.2 },
      });
      map.addSource('cities', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: CITIES.map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { name: c.name } })) },
      });
      map.addLayer({
        id: 'city-points',
        type: 'circle',
        source: 'cities',
        layout: { visibility: showCities ? 'visible' : 'none' },
        paint: { 'circle-radius': 3.5, 'circle-color': '#8fbaff', 'circle-stroke-width': 1, 'circle-stroke-color': '#e6f0ff' },
      });
      map.addLayer({
        id: 'city-labels',
        type: 'symbol',
        source: 'cities',
        layout: { visibility: showCities ? 'visible' : 'none', 'text-field': ['get', 'name'], 'text-offset': [0, 1], 'text-size': 11 },
        paint: { 'text-color': '#c7d8ef', 'text-halo-color': '#0a1320', 'text-halo-width': 1.5 },
      });
      syncMap(particlesRef.current);
    });
    map.on('error', () => setNotice('지도 타일 연결을 확인하세요. 시뮬레이션 엔진은 별도로 동작합니다.'));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Map initialized once; layer visibility is updated by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const id of ['city-points', 'city-labels']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showCities ? 'visible' : 'none');
    }
  }, [showCities]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Wind direction is shown as a compact informational overlay rather than fake vector data.
    setNotice(showWind ? `합성 바람 ${settings.windSpeedMs} m/s · ${settings.windDirectionDeg}° (FROM)` : '바람 오버레이 숨김');
  }, [showWind, settings.windSpeedMs, settings.windDirectionDeg]);

  useEffect(() => {
    settingsRef.current = settings;
    if (settings.particleCount !== particlesRef.current.length && elapsedRef.current === 0) {
      const seeded = seedParticles(settings);
      particlesRef.current = seeded;
      setParticles(seeded);
      syncMap(seeded);
    }
  }, [settings, syncMap]);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (playing) {
        if (!lastFrameRef.current) lastFrameRef.current = now;
        const realDelta = Math.min(0.25, (now - lastFrameRef.current) / 1000);
        accumulatorRef.current += realDelta * speed * 60;
        lastFrameRef.current = now;
        // Physics uses fixed 30-minute steps; playback speed changes wall-clock progression only.
        while (accumulatorRef.current >= 1800) {
          particlesRef.current = advanceParticles(particlesRef.current, settingsRef.current, 1800, elapsedRef.current);
          elapsedRef.current += 1800;
          accumulatorRef.current -= 1800;
          if (elapsedRef.current % 1800 === 0) {
            const s = getStats(particlesRef.current, elapsedRef.current);
            setSnapshot((prev) => [...prev.slice(-99), { time: elapsedRef.current, active: s.activeCount, maxDistanceKm: s.maxDistanceKm }]);
          }
        }
        setElapsed(elapsedRef.current);
        setParticles(particlesRef.current);
        syncMap(particlesRef.current);
      } else {
        lastFrameRef.current = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, syncMap]);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const reset = () => {
    setPlaying(false);
    elapsedRef.current = 0;
    accumulatorRef.current = 0;
    lastFrameRef.current = 0;
    const next = seedParticles(settingsRef.current);
    particlesRef.current = next;
    setParticles(next);
    setElapsed(0);
    setSnapshot([]);
    syncMap(next);
  };

  const exportJSON = () => download('ashflow-snapshot.json', JSON.stringify({
    model: 'ASHFLOW illustrative MVP',
    warning: 'Synthetic winds; not an operational forecast or validated reconstruction.',
    settings, elapsedSeconds: elapsed, stats, cityIndicators: cityData, particles,
  }, null, 2), 'application/json');

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">A<span>·</span></div>
        <div className="brand-copy">
          <div className="eyebrow">ATMOSPHERIC DISPERSION LAB</div>
          <h1>ASHFLOW <span>VOLCANIC ASH SIMULATOR</span></h1>
        </div>
        <div className="topbar-right">
          <span className="status-dot" />
          <span>LOCAL MODEL</span>
          <span className="version">v1.0 MVP</span>
        </div>
      </header>

      <section className="warning-strip">
        <span className="warning-icon">!</span>
        <span><strong>시뮬레이션 한계</strong> — 합성 바람장과 단순 침강 모델을 사용합니다. 실제 2010년 재현·항공 안전 판단용 데이터가 아닙니다.</span>
      </section>

      <div className="workspace">
        <aside className="control-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">CONTROL DECK</span><h2>실험 설정</h2></div>
            <span className="live-pill"><i /> {playing ? 'RUNNING' : 'PAUSED'}</span>
          </div>

          <div className="run-card">
            <div className="run-card-top"><span>SIMULATION TIME</span><span className="clock-icon">◷</span></div>
            <div className="sim-time">{Math.floor(elapsed / 3600).toString().padStart(2, '0')}<small>h</small> {Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0')}<small>m</small></div>
            <div className="time-track"><span style={{ width: `${Math.min(100, (elapsed / (120 * 3600)) * 100)}%` }} /></div>
            <div className="time-foot"><span>0 h</span><span>목표 구간 120 h</span></div>
            <div className="transport">
              <button className="btn-primary" onClick={() => setPlaying((v) => !v)}>{playing ? 'Ⅱ  일시정지' : '▶  시뮬레이션 실행'}</button>
              <button className="btn-icon" onClick={reset} title="초기화" aria-label="초기화">↺</button>
            </div>
            <div className="speed-row"><span>재생 속도</span><div className="speed-options">{SPEEDS.map((s) => <button key={s} className={speed === s ? 'selected' : ''} onClick={() => setSpeed(s)}>×{s}</button>)}</div></div>
          </div>

          <section className="control-section">
            <div className="section-title"><span className="mini-icon wind">↗</span><h3>바람장 시나리오</h3><span className="synthetic-tag">SYNTHETIC</span></div>
            <div className="field-label"><label htmlFor="wind-speed">풍속</label><strong>{settings.windSpeedMs} <small>m/s</small></strong></div>
            <input id="wind-speed" type="range" min="0" max="45" step="1" value={settings.windSpeedMs} onChange={(e) => updateSetting('windSpeedMs', Number(e.target.value))} />
            <div className="range-ends"><span>0 m/s</span><span>45 m/s</span></div>
            <div className="field-label"><label htmlFor="wind-dir">풍향 (FROM)</label><strong>{settings.windDirectionDeg}°</strong></div>
            <input id="wind-dir" type="range" min="0" max="359" value={settings.windDirectionDeg} onChange={(e) => updateSetting('windDirectionDeg', Number(e.target.value))} />
            <div className="range-ends"><span>북풍 0°</span><span>359°</span></div>
            <div className="wind-compass"><div className="compass-ring"><span className="north">N</span><span className="east">E</span><span className="south">S</span><span className="west">W</span><div className="compass-arrow" style={{ transform: `rotate(${settings.windDirectionDeg}deg)` }}>➤</div></div><div><strong>{settings.windDirectionDeg}°</strong><small>기상학적 풍향</small></div></div>
          </section>

          <section className="control-section">
            <div className="section-title"><span className="mini-icon ash">✳</span><h3>분출 및 입자</h3></div>
            <div className="field-label"><label htmlFor="emission">분출 질량률</label><strong>{(settings.emissionRateKgS / 1000).toFixed(0)} <small>t/s</small></strong></div>
            <input id="emission" type="range" min="10000" max="500000" step="10000" value={settings.emissionRateKgS} onChange={(e) => updateSetting('emissionRateKgS', Number(e.target.value))} />
            <div className="field-label"><label htmlFor="diameter">대표 입자 직경</label><strong>{settings.particleDiameterUm} <small>µm</small></strong></div>
            <input id="diameter" type="range" min="5" max="150" step="5" value={settings.particleDiameterUm} onChange={(e) => updateSetting('particleDiameterUm', Number(e.target.value))} />
            <div className="field-label"><label htmlFor="count">대표 입자 수</label><strong>{settings.particleCount.toLocaleString()}</strong></div>
            <input id="count" type="range" min="300" max="3000" step="300" value={settings.particleCount} onChange={(e) => updateSetting('particleCount', Number(e.target.value))} />
            <div className="field-label"><label htmlFor="turbulence">난류 확산 강도</label><strong>{settings.turbulence.toFixed(2)}</strong></div>
            <input id="turbulence" type="range" min="0" max="1" step="0.05" value={settings.turbulence} onChange={(e) => updateSetting('turbulence', Number(e.target.value))} />
            {elapsed > 0 && <p className="locked-note">실행 중 설정을 변경하면 현재 조건이 즉시 반영됩니다. 실험 간 비교는 초기화 후 진행하세요.</p>}
          </section>

          <section className="control-section toggles">
            <div className="section-title"><span className="mini-icon layers">▧</span><h3>지도 레이어</h3></div>
            <label className="toggle-line"><span>도시 위치 및 라벨</span><input type="checkbox" checked={showCities} onChange={(e) => setShowCities(e.target.checked)} /><i /></label>
            <label className="toggle-line"><span>바람 시나리오 정보</span><input type="checkbox" checked={showWind} onChange={(e) => setShowWind(e.target.checked)} /><i /></label>
            <p className="map-note">{notice}</p>
          </section>

          <div className="export-actions">
            <button onClick={() => download('ashflow-particles.csv', exportCSV(particles, elapsed), 'text/csv;charset=utf-8')}>↓ CSV 내보내기</button>
            <button onClick={exportJSON}>↓ JSON 내보내기</button>
          </div>
          <div className="panel-footer">ASHFLOW RESEARCH PROTOTYPE <span>·</span> NOT FOR OPERATIONAL USE</div>
        </aside>

        <section className="map-panel">
          <div className="map-top-overlay">
            <div className="map-title"><span className="map-pin">⌖</span><div><strong>북대서양 · 유럽</strong><small>Eyjafjallajökull / Ash dispersion field</small></div></div>
            <div className="map-badges"><span><i className="dot ash-dot" />화산재 입자</span><span><i className="dot vent-dot" />분화구</span></div>
          </div>
          <div ref={mapContainer} className="map-container" />
          <div className="map-bottom-overlay">
            <div className="legend"><span className="legend-title">입자 상태</span><span><i className="legend-dot active-dot" />대기 중</span><span><i className="legend-dot vent-legend" />분화구</span></div>
            <div className="map-coordinates">63.633°N / 19.620°W <span>·</span> EARTH GLOBE</div>
          </div>
          <div className="map-status"><span className="status-dot" /> {particles.filter((p) => p.alive).length.toLocaleString()} ACTIVE PARTICLES</div>
        </section>

        <aside className="insight-panel">
          <div className="panel-heading"><div><span className="section-kicker">MODEL TELEMETRY</span><h2>실시간 분석</h2></div><span className="telemetry-icon">⌁</span></div>
          <div className="metric-grid">
            <div className="metric-card"><span>대기 중 입자</span><strong>{stats.activeCount.toLocaleString()}</strong><small>개 / 대표 입자</small><div className="metric-spark spark-one"><i /><i /><i /><i /><i /><i /><i /></div></div>
            <div className="metric-card"><span>질량 가중 평균 고도</span><strong>{(stats.meanAltitudeM / 1000).toFixed(2)}<small> km</small></strong><small>대기 중 대표 입자 기준</small><div className="metric-spark spark-two"><i /><i /><i /><i /><i /><i /><i /></div></div>
            <div className="metric-card"><span>최대 고도</span><strong>{(stats.maxAltitudeM / 1000).toFixed(2)}<small> km</small></strong><small>모델 입자 중 최대값</small></div>
            <div className="metric-card"><span>최대 지표 거리</span><strong>{Math.round(stats.maxDistanceKm).toLocaleString()}<small> km</small></strong><small>분화구부터 대권 거리</small></div>
          </div>

          <section className="insight-section">
            <div className="section-title"><span className="mini-icon city">⌖</span><h3>유럽 주요 도시 지표</h3></div>
            <p className="subtext">화면용 상대 지표 · 공식 대기질 농도 아님</p>
            <div className="city-list">{cityData.map((city) => {
              const width = Math.max(4, Math.min(100, city.proxy * 5));
              const severity = city.proxy >= 5 ? 'high' : city.proxy >= 2 ? 'medium' : 'low';
              return <div className="city-row" key={city.name}><div className="city-row-top"><span className="city-name"><i className={`city-indicator ${severity}`} />{city.name}</span><span className={`city-level ${severity}`}>{city.level}</span></div><div className="city-meter"><span className={severity} style={{ width: `${width}%` }} /></div></div>;
            })}</div>
          </section>

          <section className="insight-section">
            <div className="section-title"><span className="mini-icon trend">⌁</span><h3>스냅샷 이력</h3><span className="snapshot-count">{snapshot.length} RECORDS</span></div>
            <div className="snapshot-chart">
              {snapshot.length === 0 ? <div className="chart-empty"><span>⌁</span><p>시뮬레이션을 실행하면<br />30분 간격 기록이 표시됩니다.</p></div> : <div className="chart-bars">{snapshot.slice(-24).map((s, i) => <div key={`${s.time}-${i}`} className="chart-bar-wrap" title={`${Math.floor(s.time / 3600)}h ${Math.floor((s.time % 3600) / 60)}m · ${s.active} active`}><div className="chart-bar" style={{ height: `${Math.max(4, (s.active / Math.max(1, snapshot[0]?.active ?? s.active)) * 100)}%` }} /><small>{i % 4 === 0 ? `${Math.floor(s.time / 3600)}h` : ''}</small></div>)}</div>}
            </div>
          </section>

          <section className="mass-card">
            <div><span>현재 대기 질량(모델)</span><strong>{formatMass(stats.airborneMassKg)}</strong></div>
            <div className="mass-ring" style={{ background: `conic-gradient(#f8a75b ${Math.max(0, 1 - stats.depositionFraction) * 360}deg, #253347 0deg)` }}><div>{Math.round((1 - stats.depositionFraction) * 100)}<small>%</small></div></div>
          </section>
          <div className="insight-footer"><span className="footer-pulse" /> MODEL RUNNING LOCALLY <span>·</span> DATA IS ILLUSTRATIVE</div>
        </aside>
      </div>
      <footer className="app-footer"><span>ASHFLOW / VOLCANIC ASH DISPERSION MODEL</span><span>Built for research & education <i>·</i> Not an aviation safety tool</span></footer>
    </main>
  );
}