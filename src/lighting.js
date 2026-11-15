import * as THREE from 'three';

// Contact hardening shadows for the higher graphics levels: a shadow is crisp where the
// object meets the ground and gets softer the further it falls, as in sunlight.
// It replaces the soft shadow filter of three.js, so the lower levels are not affected.
//
// The sun is drawn about three times wider than the real one; a truly sun sized
// penumbra is too thin to see at the resolution of the shadow map.

const SAMPLES = 16;
// Penumbra width in shadow map texels per unit of depth between blocker and receiver.
const SOFTNESS = 255;

const softShadow = /* glsl */ `
	vec2 softShadowDisk( int index, float rotation ) {
		float radius = sqrt( ( float( index ) + 0.5 ) / ${SAMPLES}.0 );
		float angle = float( index ) * 2.39996323 + rotation;
		return vec2( cos( angle ), sin( angle ) ) * radius;
	}

	float softShadow( sampler2D shadowMap, vec2 shadowMapSize, vec3 coord ) {
		float rotation = 6.2831853 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
		vec2 texel = 1.0 / shadowMapSize;
		float blockerDepth = 0.0;
		float blockers = 0.0;
		for ( int i = 0; i < ${SAMPLES}; i ++ ) {
			float depth = unpackRGBAToDepth( texture2D( shadowMap, coord.xy + softShadowDisk( i, rotation ) * 12.0 * texel ) );
			if ( depth < coord.z ) {
				blockerDepth += depth;
				blockers += 1.0;
			}
		}
		if ( blockers < 0.5 ) return 1.0;
		float radius = clamp( ( coord.z - blockerDepth / blockers ) * ${SOFTNESS}.0, 1.2, 14.0 );
		float lit = 0.0;
		for ( int i = 0; i < ${SAMPLES}; i ++ ) {
			lit += step( coord.z, unpackRGBAToDepth( texture2D( shadowMap, coord.xy + softShadowDisk( i, rotation + 1.7 ) * radius * texel ) ) );
		}
		return lit / ${SAMPLES}.0;
	}

`;

export function installSoftShadows() {
  const entry = 'float getShadow( sampler2D shadowMap';
  const branch = '#if defined( SHADOWMAP_TYPE_PCF )';
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (!chunk.includes(entry) || !chunk.includes(branch)) {
    console.warn('Soft shadows are unavailable with this version of three.js');
    return;
  }
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk
    .replace(entry, softShadow + entry)
    .replace(branch, `#if defined( SHADOWMAP_TYPE_PCF_SOFT )

			shadow = softShadow( shadowMap, shadowMapSize, shadowCoord.xyz );

		#elif defined( SHADOWMAP_TYPE_PCF )`);
}

// Stand-in for sunlight bouncing off the ground and nearby walls: a weak warm light from
// the side opposite the sun and from below, without shadows. Ambient occlusion keeps it
// out of deep corners.
export function createBounceLight(sunDirection) {
  const light = new THREE.DirectionalLight(0xffc48a, 0.95);
  light.position.set(-sunDirection.x, -0.42, -sunDirection.z).normalize().multiplyScalar(300);
  return light;
}
