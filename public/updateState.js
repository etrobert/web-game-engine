import { plotHealth } from './plotHealth.js';
import { distanceVector, squaredDistance, collisionRadius } from './entity.js';
import { addVectors, multiplyVector, normalizeVector } from './vector.js';
import { dashDuration } from './dash.js';
import { enemyAccelerationConstant, spawnEnemy } from './enemy.js';
import updateCharacterAnimation from './updateCharacterAnimation.js';
import { enemyDeath, lossHealthSfx, shroudMusic } from './audio/openSounds.js';
import { playSfx } from './audio/playSounds.js';
import { partition } from './tools.js';

const resistanceConstant = 100 / 1000;
const minSpeed = 0.03;

const updateSpeed = (entity, timeDelta) => {
  if (!entity.speed) return entity;

  const resistanceImpact = multiplyVector(timeDelta * resistanceConstant, {
    x: -entity.speed.x * Math.abs(entity.speed.x),
    y: -entity.speed.y * Math.abs(entity.speed.y),
  });

  const accelerationImpact = multiplyVector(timeDelta, entity.acceleration);

  const speed = addVectors(resistanceImpact, accelerationImpact, entity.speed);
  speed.x = Math.abs(speed.x) < minSpeed ? 0 : speed.x;
  speed.y = Math.abs(speed.y) < minSpeed ? 0 : speed.y;

  return { ...entity, speed };
};

const updatePosition = (entity, collidables, timeDelta) => {
  if (!entity.speed) return entity;
  const futureEntity = {
    ...entity,
    position: addVectors(
      entity.position,
      multiplyVector(timeDelta, entity.speed)
    ),
  };

  const colliding = collidables.some((collidable) =>
    collisionRadius(futureEntity, collidable)
  );

  return colliding ? entity : futureEntity;
};

const updateEnemyAcceleration = (enemy, characterPos, timeDelta) => {
  const vectorToCharacter = distanceVector(characterPos, enemy);
  const normVectorToCharacter = normalizeVector(vectorToCharacter);

  return {
    ...enemy,
    acceleration: multiplyVector(
      enemyAccelerationConstant * timeDelta,
      normVectorToCharacter
    ),
  };
};

const shroudShrinkSpeed = 50 / 1000;

const updateShroud = (state, timeDelta) => ({
  ...state,
  shroudRadius: Math.max(state.shroudRadius - shroudShrinkSpeed * timeDelta, 0),
});

const damage = 1;

const hitCharacter = (state, currentTime) => {
  const newHealth = state.character.health - damage;
  plotHealth(newHealth);
  playSfx(lossHealthSfx);
  return (state = {
    ...state,
    character: {
      ...state.character,
      lastInvulnerability: currentTime,
      health: newHealth,
    },
  });
};

const radiusCollision = (entity1, entity2) => {
  const d2 = squaredDistance(entity1, entity2);
  return (
    d2 <
    (entity1.hitBoxRadius + entity2.hitBoxRadius) *
      (entity1.hitBoxRadius + entity2.hitBoxRadius)
  );
};

const applyEnemyDamage = (state, currentTime) => {
  const hits = state.enemies.some((enemy) =>
    radiusCollision(enemy, state.character)
  );
  return hits ? hitCharacter(state, currentTime) : state;
};

const resetDash = (state, currentTime) => {
  if (
    currentTime - state.character.lastDash > dashDuration &&
    state.character.dashing
  ) {
    return {
      ...state,
      character: {
        ...state.character,
        dashing: false,
        acceleration: { x: 0, y: 0 },
      },
    };
  }
  return state;
};

const applyDashDamage = (state) => {
  const [enemiesHit, enemiesNotHit] = partition(state.enemies, (enemy) =>
    radiusCollision(enemy, state.character)
  );

  state.score += enemiesHit.length;

  if (enemiesHit.length > 0) playSfx(enemyDeath);
  document.getElementById('score').innerHTML = state.score;
  return { ...state, enemies: enemiesNotHit };
};

const updateShroudVolume = (position, shroudRadius) => {
  const distToCenter = position.x * position.x + position.y * position.y;
  console.log(distToCenter);
  console.log(shroudRadius);
  const level = Math.min(
    Math.max((distToCenter / (shroudRadius * shroudRadius) - 0.5) * 2.5, 0),
    1
  );
  console.log(level);
  shroudMusic.volume = level;
};

const invulnerabilityTime = 1 * 1000;
const spawnTimer = 2 * 1000;

const updateState = (state, timeDelta, currentTime) => {
  updateShroudVolume(state.character.position, state.shroudRadius);
  state = resetDash(state, currentTime);
  state.character = updateSpeed(state.character, timeDelta);
  state.character = updatePosition(state.character, state.obstacles, timeDelta);

  state.character = updateCharacterAnimation(state.character, currentTime);

  state.enemies = state.enemies.map((enemy, index) => {
    enemy = updateEnemyAcceleration(enemy, state.character, timeDelta);
    enemy = updateSpeed(enemy, timeDelta);
    const collidables = [
      ...state.obstacles,
      ...state.enemies.toSpliced(index, 1),
    ];
    return updatePosition(enemy, collidables, timeDelta);
  });

  state = state.character.dashing ? applyDashDamage(state) : state;

  state =
    currentTime - state.lastSpawn > spawnTimer
      ? spawnEnemy(state, currentTime)
      : state;
  // state = updateShroud(state, timeDelta); // TODO: fixe crasg bug, add expension with enemies death
  return currentTime - state.character.lastInvulnerability < invulnerabilityTime
    ? state
    : applyEnemyDamage(state, currentTime);
};
export default updateState;
