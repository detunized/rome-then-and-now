import * as THREE from 'three';

// Frame by frame video capture. It is not loaded by the page; import it from the console:
//
//   const { record } = await import('/src/capture.js');
//   record(window.app, { name: 'flyover', seconds: 12, keys: [...] });
//
// Each key is { t, position: [x, y, z], target: [x, y, z], stage } with t in seconds and
// stage on the 0 (today) to 2 (ancient) timeline. The camera follows a smooth curve through
// the keys. Every frame is rendered at a fixed time step, so the result is smooth however
// long a frame takes, and is uploaded as a JPEG to /recordings/<name>/ on the local server.
// Progress is reported in window.captureStatus.

const QUALITY_KEY = 'forum-of-caesar-quality';

function track(keys, field) {
  const curve = new THREE.CatmullRomCurve3(keys.map((key) => new THREE.Vector3().fromArray(key[field])), false, 'centripetal');
  return (segment, local) => curve.getPoint((segment + local) / (keys.length - 1));
}

function locate(keys, t) {
  let segment = 0;
  while (segment < keys.length - 2 && t >= keys[segment + 1].t) segment++;
  const from = keys[segment];
  const to = keys[segment + 1];
  const local = Math.min(1, Math.max(0, (t - from.t) / (to.t - from.t)));
  return { segment, local, stage: from.stage + (to.stage - from.stage) * local };
}

export function record(app, { name, seconds, keys, fps = 60, width = 3840, quality = 'max', jpeg = 0.95 }) {
  const total = Math.round(seconds * fps);
  const status = { name, done: 0, total, finished: false, error: '' };
  window.captureStatus = status;

  const stored = localStorage.getItem(QUALITY_KEY);
  const previous = app.getQuality().quality;
  app.applyQuality(quality);
  app.setRenderWidth(width);
  app.controls.enabled = false;

  const position = track(keys, 'position');
  const target = track(keys, 'target');
  const canvas = app.renderer.domElement;
  let index = 0;
  let busy = false;

  const finish = (error) => {
    app.hooks.beforeFrame = app.hooks.afterFrame = app.hooks.fixedDelta = null;
    app.controls.enabled = true;
    app.applyQuality(previous);
    if (stored === null) localStorage.removeItem(QUALITY_KEY);
    else localStorage.setItem(QUALITY_KEY, stored);
    status.error = error ? String(error) : '';
    status.finished = true;
  };

  app.hooks.fixedDelta = 1 / fps;
  app.hooks.beforeFrame = () => {
    const { segment, local, stage } = locate(keys, index / fps);
    app.camera.position.copy(position(segment, local));
    app.controls.target.copy(target(segment, local));
    app.camera.lookAt(app.controls.target);
    app.setStage(stage);
  };
  app.hooks.afterFrame = () => {
    if (busy || status.finished) return;
    busy = true;
    app.hooks.fixedDelta = 0;
    const file = `/recordings/${name}/frame_${String(index).padStart(5, '0')}.jpg`;
    canvas.toBlob((blob) => {
      fetch(file, { method: 'PUT', body: blob })
        .then((response) => {
          if (!response.ok) throw new Error(`upload failed with status ${response.status}`);
          index++;
          status.done = index;
          if (index >= total) finish();
          else {
            app.hooks.fixedDelta = 1 / fps;
            busy = false;
          }
        })
        .catch(finish);
    }, 'image/jpeg', jpeg);
  };
  return status;
}
