import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Task data embedded (from CSV)
const TASKS = [
  {
    id: 1,
    human_task: "When you are making origami following a tutorial",
    human_task_short: "Making origami",
    robot_task: "Robot brings a contract that needs to be signed before the deadline",
    robot_item: "Contract",
    x_urgency: 1.0,
    x_relev: 0.3,
    high_lod: "Here is the contract you need to sign; I interrupted you because the deadline is imminent and cannot wait.",
    mid_lod: "Here is the contract for you to sign before the deadline.",
    low_lod: "Here is the contract."
  },
  {
    id: 2,
    human_task: "When you are making origami following a tutorial",
    human_task_short: "Making origami",
    robot_task: "Robot brings extra spare paper (in case you break it later)",
    robot_item: "Spare paper",
    x_urgency: 0.3,
    x_relev: 1.0,
    high_lod: "Here is extra spare paper in case you tear the current sheet; I brought this proactively to ensure you can complete the origami without interruption.",
    mid_lod: "Here is extra spare paper in case you break your current one.",
    low_lod: "Here is extra spare paper."
  },
  {
    id: 3,
    human_task: "When you are making origami following a tutorial",
    human_task_short: "Making origami",
    robot_task: "Robot brings you a pair of scissors because the next step is to cut",
    robot_item: "Scissors",
    x_urgency: 1.0,
    x_relev: 1.0,
    high_lod: "Here is a pair of scissors to perform the cut; I retrieved them because the next step in your tutorial specifically requires them.",
    mid_lod: "Here is a pair of scissors to help you with the next cutting step.",
    low_lod: "Here is a pair of scissors."
  },
  {
    id: 4,
    human_task: "When you are making origami following a tutorial",
    human_task_short: "Making origami",
    robot_task: "Robot brings a cushion to make your seat more comfortable",
    robot_item: "Cushion",
    x_urgency: 0.3,
    x_relev: 0.3,
    high_lod: "Here is a cushion to improve your seating comfort; I noticed you have been sitting for a while and thought you might like better support.",
    mid_lod: "Here is a cushion to make your seat more comfortable.",
    low_lod: "Here is a cushion."
  },
  {
    id: 5,
    human_task: "When you are playing leisure Sudoku with a pen",
    human_task_short: "Playing Sudoku",
    robot_task: "Robot brings a contract that needs to be signed before the deadline",
    robot_item: "Contract",
    x_urgency: 1.0,
    x_relev: 0.3,
    high_lod: "Here is the contract you need to sign; I interrupted you because the deadline is imminent and cannot wait.",
    mid_lod: "Here is the contract for you to sign before the deadline.",
    low_lod: "Here is the contract."
  },
  {
    id: 6,
    human_task: "When you are playing leisure Sudoku with a pen",
    human_task_short: "Playing Sudoku",
    robot_task: "Robot brings a skill reference book for Sudoku strategies",
    robot_item: "Reference book",
    x_urgency: 0.3,
    x_relev: 1.0,
    high_lod: "Here is a Sudoku strategy reference book; I noticed you might benefit from some solving techniques to help with tricky puzzles.",
    mid_lod: "Here is a reference book with Sudoku strategies you might find helpful.",
    low_lod: "Here is a reference book."
  },
  {
    id: 7,
    human_task: "When you are playing leisure Sudoku with a pen",
    human_task_short: "Playing Sudoku",
    robot_task: "Robot brings a pencil and eraser because you may need to revise",
    robot_item: "Pencil & eraser",
    x_urgency: 1.0,
    x_relev: 1.0,
    high_lod: "Here is a pencil and eraser for revisions; I noticed you are using a pen, and these will help if you need to correct any entries.",
    mid_lod: "Here is a pencil and eraser in case you need to make corrections.",
    low_lod: "Here is a pencil and eraser."
  },
  {
    id: 8,
    human_task: "When you are playing leisure Sudoku with a pen",
    human_task_short: "Playing Sudoku",
    robot_task: "Robot brings a cushion to make your seat more comfortable",
    robot_item: "Cushion",
    x_urgency: 0.3,
    x_relev: 0.3,
    high_lod: "Here is a cushion to improve your seating comfort; I noticed you have been sitting for a while and thought you might like better support.",
    mid_lod: "Here is a cushion to make your seat more comfortable.",
    low_lod: "Here is a cushion."
  }
];

const STAGES = ['departure', 'approach', 'arrival'];

const getInitialViewportWidth = () => (
  typeof window === 'undefined' ? 1440 : window.innerWidth
);

// =========================
// Task-group onboarding
// =========================
const GROUP_DEFS = {
  origami: {
    label: 'Origami',
    human_task_short: 'Making origami',
    title: 'Task Context: Origami',
    humanState:
      "In the next set of scenarios, you are folding origami while following a tutorial. This task is relatively complex and requires your full attention. Assume you are fully engaged and focused on the task."
  },
  sudoku: {
    label: 'Sudoku',
    human_task_short: 'Playing Sudoku',
    title: 'Task Context: Sudoku',
    humanState:
      "In the next set of scenarios, you are solving a leisure Sudoku with a pen. This task is relatively simple, and you feel more relaxed. Assume you are generally less tense and less cognitively loaded."
  }
};

const getGroupKeyForTask = (task) => {
  if (!task) return 'origami';
  return task.human_task_short === GROUP_DEFS.sudoku.human_task_short ? 'sudoku' : 'origami';
};

const toLevelLabel = (v) => (v > 0.5 ? 'High' : 'Low');

const ENGAGEMENT_LEVELS = {
  // [CHANGED] Departure engagement is fixed to low (fully focused on the manual task, not looking at robot)
  departure: { level: 'low', description: "I remain focused on the task and do not look up." },
  approach: [
    { level: 'low', description: "I stay focused and do not look at the robot." },
    { level: 'mid', description: "I briefly glance at the robot but keep working." },
    { level: 'high', description: "I fully look at the robot and pause what I'm doing." }
  ],
  arrival: [
    { level: 'low', description: "I stay focused and do not look at the robot." },
    { level: 'mid', description: "I briefly glance at the robot but keep working." },
    { level: 'high', description: "I fully look at the robot and pause what I'm doing." }
  ]
};

// [NEW] Reusable empty choices factory (so we can restore/reset per scenario)
const makeEmptyChoices = () => ({
  // [CHANGED] Engagement: departure fixed to low; approach/arrival participant selects via dropdown
  departure: { engagement: ENGAGEMENT_LEVELS.departure, movement: null, speechEnabled: null, speechTiming: null, lod: null },
  approach: { engagement: null, movement: null, speechEnabled: null, speechTiming: null, lod: null },
  arrival: { engagement: null, movement: null, speechEnabled: null, speechTiming: null, lod: null }
});

// Removed "stop" option
const MOVEMENT_OPTIONS = [
  { id: 'normal', label: 'Normal speed', speed: 1.0 },
  { id: 'slow', label: 'Slow down', speed: 0.5 }
];

// Speech yes/no first
const SPEECH_ENABLED_OPTIONS = [
  { id: 'yes', label: 'Yes, robot should speak', enabled: true },
  { id: 'no', label: 'No speech at this stage', enabled: false }
];

// Then timing if speech enabled
const SPEECH_TIMING_OPTIONS = [
  { id: 'before', label: 'Before moving', timing: 'before' },
  { id: 'during', label: 'During movement', timing: 'during' },
  { id: 'after', label: 'After movement', timing: 'after' }
];

const LOD_OPTIONS = [
  { id: 'high', label: 'Detailed', duration: '9s' },
  { id: 'mid', label: 'Brief', duration: '6s' },
  { id: 'low', label: 'Minimal', duration: '3s' }
];

const STAGE_COLORS = {
  departure: '#e94560',
  approach: '#ffc107',
  arrival: '#a855f7'
};

const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized.length === 3
    ? sanitized.split('').map(ch => ch + ch).join('')
    : sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const FULL_SIM_BASE_WIDTH = 480;
const FULL_SIM_HEIGHT = 150;
const USER_COLOR = '#ffffff';
const ATTENTION_ARROW_OFFSETS = {
  high: { dx: -40, dy: -8 },
  mid: { dx: -32, dy: 20 },
  low: { dx: 0, dy: 32 }
};
const ATTENTION_ARROW_COLOR = '#ff4d6d';

const drawAttentionArrow = (ctx, originX, originY, level, scale = 1) => {
  if (!level) return;
  const base = ATTENTION_ARROW_OFFSETS[level] || ATTENTION_ARROW_OFFSETS.low;
  const dx = base.dx * scale;
  const dy = base.dy * scale;
  const endX = originX + dx;
  const endY = originY + dy;
  const angle = Math.atan2(dy, dx);

  ctx.strokeStyle = ATTENTION_ARROW_COLOR;
  ctx.fillStyle = ATTENTION_ARROW_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.beginPath();
  const headSize = 7;
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headSize * Math.cos(angle - Math.PI / 6),
    endY - headSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - headSize * Math.cos(angle + Math.PI / 6),
    endY - headSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
};
const STAGE_ZONE_LAYOUT = {
  departure: {
    startRatio: 40 / FULL_SIM_BASE_WIDTH,
    endRatio: 150 / FULL_SIM_BASE_WIDTH,
    color: hexToRgba(STAGE_COLORS.departure, 0.18)
  },
  approach: {
    startRatio: 150 / FULL_SIM_BASE_WIDTH,
    endRatio: 300 / FULL_SIM_BASE_WIDTH,
    color: hexToRgba(STAGE_COLORS.approach, 0.15)
  },
  arrival: {
    startRatio: 300 / FULL_SIM_BASE_WIDTH,
    endRatio: 420 / FULL_SIM_BASE_WIDTH,
    color: hexToRgba(STAGE_COLORS.arrival, 0.18)
  }
};

// Mini simulation for each stage column - robot moves left to right
function MiniSimulation({ stage, choices, task, isActive }) {
  const canvasRef = useRef(null);
  
  // Adjusted stage zones: departure and arrival smaller
  // Robot moves from left to right (approaching user on right)
  // Canvas width = 300, so positions are relative to that
  const stageBounds = {
    departure: { startX: 30, endX: 100 },   // small zone on left
    approach: { startX: 100, endX: 230 },   // large middle zone
    arrival: { startX: 230, endX: 270 }     // small zone near user
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(0, 0, w, h);

    // Floor
    ctx.fillStyle = '#1a2332';
    ctx.fillRect(0, h - 15, w, 15);

    // Stage zone highlight - robot travels through this zone
    const bounds = stageBounds[stage];
    const highlightColor = isActive
      ? hexToRgba(STAGE_COLORS[stage], 0.2)
      : 'rgba(255,255,255,0.03)';
    const zoneStart = Math.min(bounds.startX, bounds.endX);
    const zoneWidth = Math.abs(bounds.startX - bounds.endX);
    ctx.fillRect(zoneStart, 0, zoneWidth, h - 15);

    // User (right side, smaller icon)
    const userCenterX = w - 10;
    ctx.fillStyle = USER_COLOR;
    ctx.beginPath();
    ctx.arc(userCenterX, h - 35, 8, 0, Math.PI * 2);
    ctx.fill();
    const engagementLevel = stage === 'departure'
      ? ENGAGEMENT_LEVELS.departure.level
      : choices?.engagement?.level;
    if (engagementLevel) {
      drawAttentionArrow(ctx, userCenterX, h - 35, engagementLevel, 0.55);
    }
    
    // Robot position: starts at startX, ends at endX (moving right toward user)
    const robotX = choices?.movement 
      ? bounds.endX  // if movement selected, show at end position
      : bounds.startX; // otherwise show at start position

    // Robot body (on left side, facing right toward user)
    ctx.fillStyle = isActive ? '#00d9ff' : '#4a5568';
    ctx.fillRect(robotX - 10, h - 42, 20, 20);
    
    // Robot wheels
    ctx.fillStyle = '#1a2332';
    ctx.beginPath();
    ctx.arc(robotX - 5, h - 20, 4, 0, Math.PI * 2);
    ctx.arc(robotX + 5, h - 20, 4, 0, Math.PI * 2);
    ctx.fill();

    // Robot face (eyes facing right toward user)
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(robotX + 2, h - 38, 4, 4);
    ctx.fillRect(robotX + 8, h - 38, 4, 4);

    // Speech indicator
    if (choices?.speechEnabled?.enabled && choices?.speechTiming) {
      ctx.fillStyle = '#fff';
      ctx.font = '10px system-ui';
      ctx.fillText('💬', robotX + 8, h - 48);
    }

  }, [stage, choices, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={70}
      style={{
        width: '100%',
        borderRadius: '8px',
        border: isActive ? '1px solid #00d9ff' : '1px solid #2d3748',
        opacity: isActive ? 1 : 0.6
      }}
    />
  );
}

// LOD speech duration in milliseconds
const LOD_DURATIONS = {
  low: 3000,   // 3 seconds
  mid: 6000,   // 6 seconds
  high: 9000   // 9 seconds
};

// Full simulation showing complete journey
function FullSimulation({ allChoices, task, isPlaying, onComplete, hoveredStage }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [fullSimWidth, setFullSimWidth] = useState(FULL_SIM_BASE_WIDTH);
  const stageZones = useMemo(() => {
    const makeZone = ({ startRatio, endRatio, color }) => ({
      startX: fullSimWidth * startRatio,
      endX: fullSimWidth * endRatio,
      color
    });
    return {
      departure: makeZone(STAGE_ZONE_LAYOUT.departure),
      approach: makeZone(STAGE_ZONE_LAYOUT.approach),
      arrival: makeZone(STAGE_ZONE_LAYOUT.arrival)
    };
  }, [fullSimWidth]);
  const [robotX, setRobotX] = useState(stageZones.departure.startX);
  const [currentStage, setCurrentStage] = useState(null);
  const [showSpeech, setShowSpeech] = useState(false);
  const [speechText, setSpeechText] = useState('');
  const [speechProgress, setSpeechProgress] = useState(0);
  const highlightedStage = hoveredStage ?? currentStage;

  useEffect(() => {
    const updateWidth = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const containerWidth = canvas.parentElement?.clientWidth || FULL_SIM_BASE_WIDTH;
      setFullSimWidth(containerWidth);
    };
    updateWidth();
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    setRobotX(stageZones.departure.startX);
    setCurrentStage(null);
    setShowSpeech(false);
    setSpeechProgress(0);

    let stageIndex = 0;
    let phaseStartTime = null;
    let currentPhase = 'init'; // 'init', 'before_speech', 'moving', 'after_speech', 'during_remaining'
    const stages = ['departure', 'approach', 'arrival'];

    const runAnimation = (timestamp) => {
      if (stageIndex >= stages.length) {
        setShowSpeech(false);
        setSpeechProgress(0);
        onComplete?.();
        return;
      }

      const stage = stages[stageIndex];
      const choices = allChoices[stage];
      const zone = stageZones[stage];
      const speed = choices?.movement?.speed ?? 1.0;
      const moveDistance = Math.abs(zone.endX - zone.startX);
      const direction = zone.endX >= zone.startX ? 1 : -1;
      const moveDuration = (moveDistance / 120) * (1000 / speed); // Base: 120px per second at speed 1.0

      const hasSpeech = choices?.speechEnabled?.enabled && choices?.speechTiming && choices?.lod;
      const timing = hasSpeech ? choices.speechTiming.timing : null;
      const speechDuration = hasSpeech ? LOD_DURATIONS[choices.lod.id] : 0;
      const speechTextContent = hasSpeech ? task[`${choices.lod.id}_lod`] : '';

      // Initialize phase for new stage
      if (currentPhase === 'init') {
        setCurrentStage(stage);
        if (timing === 'before') {
          currentPhase = 'before_speech';
          phaseStartTime = timestamp;
          setShowSpeech(true);
          setSpeechText(speechTextContent);
        } else {
          currentPhase = 'moving';
          phaseStartTime = timestamp;
          if (timing === 'during') {
            setShowSpeech(true);
            setSpeechText(speechTextContent);
          }
        }
      }

      const phaseElapsed = timestamp - phaseStartTime;

      // State machine for each phase
      if (currentPhase === 'before_speech') {
        // Standing still, speaking before movement
        setRobotX(zone.startX);
        setSpeechProgress(Math.min(phaseElapsed / speechDuration, 1));
        
        if (phaseElapsed >= speechDuration) {
          setShowSpeech(false);
          setSpeechProgress(0);
          currentPhase = 'moving';
          phaseStartTime = timestamp;
        }
      } else if (currentPhase === 'moving') {
        const moveProgress = Math.min(phaseElapsed / moveDuration, 1);
        const newX = zone.startX + direction * moveDistance * moveProgress;
        setRobotX(newX);

        // Update speech progress if during
        if (timing === 'during') {
          setSpeechProgress(Math.min(phaseElapsed / speechDuration, 1));
        }

        if (moveProgress >= 1) {
          // Movement complete
          if (timing === 'during' && phaseElapsed < speechDuration) {
            // Still speaking, wait for speech to finish
            currentPhase = 'during_remaining';
            // Keep phaseStartTime to continue speech timing
          } else if (timing === 'after') {
            currentPhase = 'after_speech';
            phaseStartTime = timestamp;
            setShowSpeech(true);
            setSpeechText(speechTextContent);
          } else {
            // No speech or speech finished, move to next stage
            setShowSpeech(false);
            setSpeechProgress(0);
            stageIndex++;
            currentPhase = 'init';
            phaseStartTime = null;
          }
        }
      } else if (currentPhase === 'during_remaining') {
        // Robot stopped at end, waiting for speech to finish
        setRobotX(zone.endX);
        setSpeechProgress(Math.min(phaseElapsed / speechDuration, 1));

        if (phaseElapsed >= speechDuration) {
          setShowSpeech(false);
          setSpeechProgress(0);
          stageIndex++;
          currentPhase = 'init';
          phaseStartTime = null;
        }
      } else if (currentPhase === 'after_speech') {
        // Standing at end, speaking after movement
        setRobotX(zone.endX);
        setSpeechProgress(Math.min(phaseElapsed / speechDuration, 1));

        if (phaseElapsed >= speechDuration) {
          setShowSpeech(false);
          setSpeechProgress(0);
          stageIndex++;
          currentPhase = 'init';
          phaseStartTime = null;
        }
      }

      animationRef.current = requestAnimationFrame(runAnimation);
    };

    animationRef.current = requestAnimationFrame(runAnimation);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, allChoices, task, stageZones, onComplete]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const logicalWidth = fullSimWidth;
    const logicalHeight = FULL_SIM_HEIGHT;

    if (canvas.width !== logicalWidth * pixelRatio || canvas.height !== logicalHeight * pixelRatio) {
      canvas.width = logicalWidth * pixelRatio;
      canvas.height = logicalHeight * pixelRatio;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(pixelRatio, pixelRatio);

    const w = logicalWidth;
    const h = logicalHeight;

    // Background
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(0, 0, w, h);

    // Floor
    ctx.fillStyle = '#1a2332';
    ctx.fillRect(0, h - 25, w, 25);

    // Stage zones with labels
    const zoneEntries = [
      ['departure', stageZones.departure],
      ['approach', stageZones.approach],
      ['arrival', stageZones.arrival]
    ];
    
    zoneEntries.forEach(([stage, zone]) => {
      ctx.fillStyle = highlightedStage === stage ? zone.color : 'rgba(255,255,255,0.02)';
      const zoneStart = Math.min(zone.startX, zone.endX);
      const zoneWidth = Math.abs(zone.startX - zone.endX);
      ctx.fillRect(zoneStart, 0, zoneWidth, h - 25);
      
      // Zone labels at top
      ctx.fillStyle = highlightedStage === stage ? '#fff' : '#4a5568';
      ctx.font = '10px system-ui';
      const labelX = zoneStart + zoneWidth / 2 - 20;
      ctx.fillText(stage.charAt(0).toUpperCase() + stage.slice(1), labelX, 14);
    });

    // Zone dividers
    ctx.strokeStyle = '#2d3748';
    ctx.setLineDash([3, 3]);
    [stageZones.departure.endX, stageZones.approach.endX].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, h - 25);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // User (right side, at desk)
    // Desk
    const deskWidth = 60;
    const userDeskX = w - deskWidth - 60;
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(userDeskX, h - 60, deskWidth, 35);
    
    // User
    const userCenterX = userDeskX + deskWidth / 2;
    ctx.fillStyle = USER_COLOR;
    ctx.beginPath();
    ctx.arc(userCenterX, h - 82, 18, 0, Math.PI * 2);
    ctx.fill();
    const highlightedEngagement = highlightedStage === 'departure'
      ? ENGAGEMENT_LEVELS.departure.level
      : allChoices[highlightedStage]?.engagement?.level;
    if (highlightedEngagement) {
      drawAttentionArrow(ctx, userCenterX, h - 82, highlightedEngagement, 1.1);
    }
    
    // User task label BELOW user
    ctx.fillStyle = '#a0aec0';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(task.human_task_short, userCenterX, h - 8);
    ctx.textAlign = 'left';

    // Robot (moving from left to right)
    ctx.fillStyle = '#00d9ff';
    ctx.fillRect(robotX - 16, h - 60, 32, 30);
    
    // Robot face (eyes facing right toward user)
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(robotX + 6, h - 54, 5, 5);
    ctx.fillRect(robotX + 12, h - 54, 5, 5);
    
    // Robot wheels
    ctx.fillStyle = '#1a2332';
    ctx.beginPath();
    ctx.arc(robotX - 8, h - 28, 6, 0, Math.PI * 2);
    ctx.arc(robotX + 8, h - 28, 6, 0, Math.PI * 2);
    ctx.fill();

    // Robot item label BELOW robot
    ctx.fillStyle = '#00d9ff';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(task.robot_item, robotX, h - 8);
    ctx.textAlign = 'left';

    // Speech bubble (to the right of robot, pointing left)
    if (showSpeech && speechText) {
      const bubbleW = 160;
      const bubbleH = 55;
      const bubbleX = Math.min(robotX + 25, w - bubbleW - 10);
      const bubbleY = h - 130;

      // Bubble background
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
      ctx.fill();

      // Pointer (pointing to robot on left)
      ctx.beginPath();
      ctx.moveTo(bubbleX, bubbleY + 20);
      ctx.lineTo(bubbleX - 10, bubbleY + 27);
      ctx.lineTo(bubbleX, bubbleY + 34);
      ctx.fill();

      // Speech progress bar at bottom of bubble
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(bubbleX + 6, bubbleY + bubbleH - 8, bubbleW - 12, 4);
      ctx.fillStyle = '#00d9ff';
      ctx.fillRect(bubbleX + 6, bubbleY + bubbleH - 8, (bubbleW - 12) * speechProgress, 4);

      // Text with word wrap
      ctx.fillStyle = '#0f1419';
      ctx.font = '10px system-ui';
      const words = speechText.split(' ');
      let line = '';
      let y = bubbleY + 14;
      const maxLines = 3;
      let lineCount = 0;
      
      for (let i = 0; i < words.length && lineCount < maxLines; i++) {
        const testLine = line + words[i] + ' ';
        if (ctx.measureText(testLine).width > bubbleW - 12) {
          ctx.fillText(line.trim(), bubbleX + 6, y);
          line = words[i] + ' ';
          y += 12;
          lineCount++;
        } else {
          line = testLine;
        }
      }
      if (lineCount < maxLines && line) {
        ctx.fillText(line.trim(), bubbleX + 6, y);
      }
    }

  }, [robotX, currentStage, highlightedStage, showSpeech, speechText, speechProgress, task, fullSimWidth, stageZones, allChoices]);

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(fullSimWidth)}
      height={FULL_SIM_HEIGHT}
      style={{
        width: '100%',
        borderRadius: '12px',
        border: '1px solid #2d3748'
      }}
    />
  );
}

// Radio button group component
function RadioGroup({ label, options, value, onChange, showPreview, task, indent, showDuration }) {
  return (
    <div style={{ marginBottom: '14px', marginLeft: indent ? '16px' : 0 }}>
      <div style={{ 
        fontSize: '11px', 
        color: '#718096', 
        marginBottom: '6px',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {options.map(opt => (
          <label
            key={opt.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '7px 10px',
              background: value?.id === opt.id ? 'rgba(0, 217, 255, 0.1)' : 'transparent',
              border: value?.id === opt.id ? '1px solid #00d9ff' : '1px solid #2d3748',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <input
              type="radio"
              checked={value?.id === opt.id}
              onChange={() => onChange(opt)}
              style={{ marginTop: '2px', accentColor: '#00d9ff' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                <span>{opt.label}</span>
                {showDuration && opt.duration && (
                  <span style={{ color: '#00d9ff', fontSize: '11px' }}>{opt.duration}</span>
                )}
              </div>
              {showPreview && task && (
                <div style={{ 
                  fontSize: '10px', 
                  color: '#718096', 
                  marginTop: '3px',
                  fontStyle: 'italic',
                  lineHeight: 1.4
                }}>
                  "{task[`${opt.id}_lod`]?.slice(0, 50)}..."
                </div>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// Stage column component
function StageColumn({ stage, stageIndex, choices, onChoiceChange, task, isComplete, onHoverChange }) {
  const stageDescriptions = {
    departure: 'Robot starts moving',
    approach: 'Robot getting closer',
    arrival: 'Robot reaches you'
  };

  return (
    <div
      onMouseEnter={() => onHoverChange?.(stage)}
      onMouseLeave={() => onHoverChange?.(null)}
      style={{
      flex: 1,
      background: '#12171f',
      borderRadius: '12px',
      padding: '14px',
      border: isComplete ? '1px solid #2d3748' : '1px solid rgba(0, 217, 255, 0.4)',
      opacity: isComplete ? 0.9 : 1
    }}>
      {/* Stage Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        marginBottom: '10px'
      }}>
        <div style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          background: STAGE_COLORS[stage],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 600,
          color: '#0f1419'
        }}>
          {stageIndex + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontSize: '13px', 
            fontWeight: 600,
            color: '#e2e8f0',
            textTransform: 'capitalize'
          }}>
            {stage}
          </div>
          <div style={{ fontSize: '10px', color: '#718096' }}>
            {stageDescriptions[stage]}
          </div>
        </div>
        {isComplete && (
          <div style={{ color: '#48bb78', fontSize: '14px' }}>✓</div>
        )}
      </div>

      {/* Mini Simulation */}
      <div style={{ marginBottom: '10px' }}>
        <MiniSimulation 
          stage={stage} 
          choices={choices} 
          task={task}
          isActive={!isComplete}
        />
      </div>

      {/* Engagement Status */}
      <div style={{
        background: '#1a2332',
        borderRadius: '6px',
        padding: '8px 10px',
        marginBottom: '14px',
        fontSize: '11px'
      }}>
        <div style={{
          color: '#66c7ff',
          marginBottom: '6px',
          fontStyle: 'italic',
          fontWeight: 600
        }}>
          How much attention would you pay to the robot?
        </div>

        {/* [CHANGED] Departure is fixed to low; Approach/Arrival are selectable */}
        {stage === 'departure' ? (
          <div style={{ color: '#a0aec0', lineHeight: 1.4 }}>
            {ENGAGEMENT_LEVELS.departure.description}
          </div>
        ) : (
          <>
            <select
              value={choices.engagement?.level ?? ''}
              onChange={(e) => {
                const lvl = e.target.value;
                const opt = (ENGAGEMENT_LEVELS[stage] || []).find(x => x.level === lvl) || null;
                onChoiceChange(stage, 'engagement', opt);
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #2d3748',
                background: '#0f1419',
                color: '#e2e8f0',
                fontSize: '12px',
                outline: 'none',
                marginBottom: '6px'
              }}
            >
              {/* [CHANGED] Do not show Low/Mid/High. Show descriptions as option labels. */}
              <option value="" disabled>Select one description</option>
              {(ENGAGEMENT_LEVELS[stage] || []).map(opt => (
                <option key={opt.level} value={opt.level}>
                  {opt.description}
                </option>
              ))}
            </select>
            <div style={{ color: '#a0aec0', lineHeight: 1.4 }}>
              {choices.engagement?.description || 'Please select how much attention you are paying to the robot for this stage.'}
            </div>
          </>
        )}
      </div>

      {/* Robot Behavior */}
      <div style={{
        background: '#1a2332',
        borderRadius: '6px',
        padding: '8px 10px',
        marginBottom: '14px',
        fontSize: '11px'
      }}>
        <div style={{
          color: '#66c7ff',
          marginBottom: '6px',
          fontStyle: 'italic',
          fontWeight: 600
        }}>
          What would you like the robot to do?
        </div>
        <RadioGroup
          label="Movement"
          options={MOVEMENT_OPTIONS}
          value={choices.movement}
          onChange={(opt) => onChoiceChange(stage, 'movement', opt)}
        />

        <RadioGroup
          label="Speech"
          options={SPEECH_ENABLED_OPTIONS}
          value={choices.speechEnabled}
          onChange={(opt) => onChoiceChange(stage, 'speechEnabled', opt)}
        />

        {choices.speechEnabled?.enabled && (
          <>
            <RadioGroup
              label="When to speak"
              options={SPEECH_TIMING_OPTIONS}
              value={choices.speechTiming}
              onChange={(opt) => onChoiceChange(stage, 'speechTiming', opt)}
              indent={true}
            />

            <RadioGroup
              label="Detail level"
              options={LOD_OPTIONS}
              value={choices.lod}
              onChange={(opt) => onChoiceChange(stage, 'lod', opt)}
              showPreview={true}
              showDuration={true}
              task={task}
              indent={true}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Progress bar
function ProgressBar({ current, total }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        fontSize: '12px',
        color: '#a0aec0',
        marginBottom: '6px'
      }}>
        <span>Scenario {current} of {total}</span>
        <span>{Math.round((current / total) * 100)}% complete</span>
      </div>
      <div style={{
        height: '3px',
        background: '#2d3748',
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '100%',
          width: `${(current / total) * 100}%`,
          background: '#00d9ff',
          transition: 'width 0.3s ease'
        }} />
      </div>
    </div>
  );
}

// Main App
export default function App() {
  const [phase, setPhase] = useState('intro'); // 'intro' | 'onboarding' | 'scenario' | 'complete'
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [allResponses, setAllResponses] = useState({});
  // [NEW] Draft choices per scenario (so user can go back/forward without losing work)
  const [scenarioChoices, setScenarioChoices] = useState({});
  const scenarioChoicesRef = useRef({});
  const [choices, setChoices] = useState(makeEmptyChoices());
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoveredStage, setHoveredStage] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(getInitialViewportWidth());
  // [NEW] Onboarding state
  const [onboardingGroup, setOnboardingGroup] = useState('origami');
  const [seenOnboarding, setSeenOnboarding] = useState({ origami: false, sudoku: false });
  const seenOnboardingRef = useRef(seenOnboarding);

  const currentTask = TASKS[currentTaskIndex];
  const currentGroupKey = getGroupKeyForTask(currentTask);

  // [NEW] Keep a ref so we can read latest drafts when switching index,
  // without reloading and clobbering edits mid-scenario.
  useEffect(() => {
    scenarioChoicesRef.current = scenarioChoices;
  }, [scenarioChoices]);

  useEffect(() => {
    setHoveredStage(null);
  }, [currentTaskIndex, phase]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // [NEW] Track whether a group onboarding has already been shown
  useEffect(() => {
    seenOnboardingRef.current = seenOnboarding;
  }, [seenOnboarding]);

  // [NEW] When user navigates to a different scenario, restore its draft (or empty).
  useEffect(() => {
    const taskId = TASKS[currentTaskIndex]?.id;
    if (!taskId) return;
    setChoices(scenarioChoicesRef.current[taskId] ?? makeEmptyChoices());
    setIsPlaying(false);
  }, [currentTaskIndex]);

  const handleChoiceChange = useCallback((stage, type, value) => {
    setChoices(prev => {
      const updated = { ...prev, [stage]: { ...prev[stage], [type]: value } };
      // Reset dependent fields if speechEnabled changes to "no"
      if (type === 'speechEnabled' && !value.enabled) {
        updated[stage].speechTiming = null;
        updated[stage].lod = null;
      }
      return updated;
    });
  }, []);

  // [NEW] Derive engagements from current choices
  const getCurrentEngagements = useCallback((c) => ({
    departure: ENGAGEMENT_LEVELS.departure,
    approach: c.approach.engagement,
    arrival: c.arrival.engagement
  }), []);

  const isStageComplete = (stage) => {
    const c = choices[stage];
    // [NEW] Engagement required for approach and arrival; departure fixed
    if (stage !== 'departure' && !c.engagement) return false;
    if (!c.movement || !c.speechEnabled) return false;
    if (c.speechEnabled.enabled && (!c.speechTiming || !c.lod)) return false;
    return true;
  };

  const allStagesComplete = STAGES.every(isStageComplete);

  const handlePlayFull = () => {
    setIsPlaying(true);
  };

  // [NEW] Save current scenario as a draft (used by both Next and Back)
  const persistDraft = useCallback((taskId, snapshot) => {
    if (!taskId) return;
    setScenarioChoices(prev => ({
      ...prev,
      [taskId]: snapshot
    }));
  }, []);

  // [CHANGED] Submit now records response but does NOT hard reset globally.
  // Navigation is handled separately so we can support Back.
  const handleSubmitScenario = () => {
    const taskId = currentTask?.id;
    if (!taskId) return;

    persistDraft(taskId, choices);
    setAllResponses(prev => ({
      ...prev,
      [taskId]: {
        task: currentTask,
        // [CHANGED] Save engagement selections (departure fixed low, others chosen)
        engagements: getCurrentEngagements(choices),
        choices: choices
      }
    }));

    setIsPlaying(false);
    if (currentTaskIndex < TASKS.length - 1) {
      const nextIndex = currentTaskIndex + 1;
      const nextTask = TASKS[nextIndex];
      const nextGroupKey = getGroupKeyForTask(nextTask);

      if (nextGroupKey !== currentGroupKey && !seenOnboardingRef.current[nextGroupKey]) {
        setCurrentTaskIndex(nextIndex);
        setOnboardingGroup(nextGroupKey);
        setPhase('onboarding');
        return;
      }

      setCurrentTaskIndex(nextIndex);
    } else {
      setPhase('complete');
    }
  };

  // [NEW] Back button: go to previous scenario (no need to be complete)
  const handleBackScenario = () => {
    const taskId = currentTask?.id;
    if (taskId) persistDraft(taskId, choices);
    setIsPlaying(false);
    // [CHANGED] If this is the first scenario of a task group (origami: index 0, sudoku: index 4),
    // go back to that group's onboarding page.
    const groupStartIndex = TASKS.findIndex(t => getGroupKeyForTask(t) === currentGroupKey);
    if (currentTaskIndex === groupStartIndex) {
      setOnboardingGroup(currentGroupKey);
      setPhase('onboarding');
      return;
    }
    if (currentTaskIndex > 0) setCurrentTaskIndex(prev => prev - 1);
  };

  // [NEW] Continue button for onboarding
  const handleContinueFromOnboarding = () => {
    setSeenOnboarding(prev => ({ ...prev, [onboardingGroup]: true }));
    setPhase('scenario');
  };

  const scenarioPaddingValue = viewportWidth < 768 ? 12 : 16;
  const scenarioPadding = `${scenarioPaddingValue}px`;
  const showThreeColumnStages = viewportWidth >= 1350;
  const showTwoColumnStages = viewportWidth >= 900 && viewportWidth < 1350;
  const stageGridTemplate = showThreeColumnStages
    ? 'repeat(3, minmax(280px, 1fr))'
    : showTwoColumnStages
      ? 'repeat(2, minmax(280px, 1fr))'
      : '1fr';
  const stageGridGap = viewportWidth < 768 ? '12px' : '14px';
  // [CHANGED] Keep content centered and readable: full-page background + centered content shell
  const scenarioMaxWidth = '1400px';

  // [NEW] Back button for onboarding (lets user return to intro or previous scenario group)
  const handleBackFromOnboarding = () => {
    if (onboardingGroup === 'origami') {
      setPhase('intro');
      return;
    }
    setPhase('scenario');
    setCurrentTaskIndex(3); // last origami scenario (id 4)
  };

  // Intro
  if (phase === 'intro') {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f1419',
        color: '#e2e8f0',
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        {/* [CHANGED] Center a readable content shell (background stays full width) */}
        <div style={{ width: '100%', maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: 300,
            marginBottom: '14px',
            color: '#00d9ff'
          }}>
            Robot Behavior Choreography
          </h1>
          <p style={{ 
            fontSize: '0.95rem', 
            color: '#a0aec0',
            lineHeight: 1.7,
            marginBottom: '28px'
          }}>
            You will see short scenarios where a mobile robot delivers items while you are doing a cognitive-engaging task.
            You'll choreograph the robot's movement and speech by selecting a few options and watch the simulations
          </p>
          
          <div style={{
            background: '#12171f',
            border: '1px solid #2d3748',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '28px',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>
              What you will choose
            </div>
            <ul style={{ 
              listStyle: 'disc',
              paddingLeft: '18px',
              marginBottom: '16px',
              color: '#a0aec0',
              lineHeight: 1.6,
              fontSize: '0.92rem'
            }}>
              <li style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#e2e8f0' }}>How much attention are you paying to the robot?</strong> During the robot’s approach and arrival, select the description that best matches how you would react (for example, staying focused, briefly glancing, or fully attending to the robot).
              </li>
              <li>
                <strong style={{ color: '#e2e8f0' }}>What should the robot do?</strong> For each stage (departure, approach, arrival), choose how the robot should move and whether it should speak, including when it speaks and how detailed it should be.
              </li>
            </ul>
            <div style={{ 
              fontSize: '0.85rem', 
              color: '#718096', 
              borderTop: '1px solid #2d3748',
              paddingTop: '10px'
            }}>
              There are no right or wrong answers. Please choose what feels most natural to you in each context.
            </div>
          </div>

          <button
            onClick={() => {
              setCurrentTaskIndex(0);
              setOnboardingGroup('origami');
              setPhase('onboarding');
            }}
            style={{
              padding: '12px 40px',
              fontSize: '0.95rem',
              fontWeight: 500,
              background: '#00d9ff',
              border: 'none',
              borderRadius: '8px',
              color: '#0f1419',
              cursor: 'pointer'
            }}
          >
            Start Study
          </button>
        </div>
      </div>
    );
  }

  // [NEW] Onboarding pages for each task group
  if (phase === 'onboarding') {
    const def = GROUP_DEFS[onboardingGroup] ?? GROUP_DEFS.origami;
    const groupTasks = TASKS.filter(t => t.human_task_short === def.human_task_short);

    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f1419',
        color: '#e2e8f0',
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        {/* [CHANGED] Center a readable content shell (background stays full width) */}
        <div style={{ width: '100%', maxWidth: '920px', margin: '0 auto' }}>
          <h1 style={{
            fontSize: '1.6rem',
            fontWeight: 500,
            marginBottom: '10px',
            color: '#00d9ff'
          }}>
            {def.title}
          </h1>

          <div style={{
            background: '#12171f',
            border: '1px solid #2d3748',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '14px'
          }}>
            <div style={{ fontSize: '12px', color: '#718096', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              YOUR PRIMARY ACTIVITY
            </div>
            <div style={{ fontSize: '0.95rem', color: '#a0aec0', lineHeight: 1.7 }}>
              {def.humanState}
            </div>
          </div>

          <div style={{
            background: '#12171f',
            border: '1px solid #2d3748',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '18px'
          }}>
            <div style={{ fontSize: '12px', color: '#718096', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ROBOT DELIVERY
            </div>
            <div style={{ fontSize: '0.95rem', color: '#a0aec0', lineHeight: 1.7, marginBottom: '10px' }}>
              Across the next four scenarios, a mobile robot will approach to deliver different items.
              Each delivery differs in urgency and relevance to what you are doing. In these contexts, please choose your preferred robot behavior (movement and speech) across the three stages.
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
              {groupTasks.map(t => (
                <div key={t.id} style={{
                  background: '#0f1419',
                  border: '1px solid #2d3748',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#e2e8f0', marginBottom: '2px' }}>
                      {t.robot_item}
                    </div>
                    <div style={{ fontSize: '11px', color: '#718096', lineHeight: 1.4 }}>
                      {t.robot_task}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexShrink: 0, fontSize: '11px', color: '#a0aec0' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ marginBottom: '2px' }}>Urgency</div>
                      <div style={{ color: t.x_urgency > 0.5 ? '#e94560' : '#4a5568', fontWeight: 600 }}>
                        {toLevelLabel(t.x_urgency)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ marginBottom: '2px' }}>Relevance</div>
                      <div style={{ color: t.x_relev > 0.5 ? '#48bb78' : '#4a5568', fontWeight: 600 }}>
                        {toLevelLabel(t.x_relev)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleBackFromOnboarding}
                style={{
                  padding: '12px 18px',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  background: '#1a2332',
                  border: '1px solid #2d3748',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleContinueFromOnboarding}
                style={{
                  padding: '12px 28px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  background: '#00d9ff',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#0f1419',
                  cursor: 'pointer'
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Complete
  if (phase === 'complete') {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f1419',
        color: '#e2e8f0',
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        {/* [CHANGED] Center a readable content shell (background stays full width) */}
        <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ 
            fontSize: '3.5rem', 
            marginBottom: '20px',
            color: '#48bb78'
          }}>✓</div>
          <h1 style={{ fontSize: '1.6rem', marginBottom: '14px' }}>
            Study Complete
          </h1>
          <p style={{ color: '#a0aec0', marginBottom: '28px' }}>
            Thank you for your participation. Your responses have been recorded.
          </p>
          <button
            onClick={() => {
              console.log('Study Data:', JSON.stringify(allResponses, null, 2));
              alert('Data exported to console');
            }}
            style={{
              padding: '10px 20px',
              background: '#2d3748',
              border: 'none',
              borderRadius: '8px',
              color: '#e2e8f0',
              cursor: 'pointer'
            }}
          >
            Export Data
          </button>
        </div>
      </div>
    );
  }

  // Main scenario view
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1419',
      color: '#e2e8f0',
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      padding: scenarioPadding
    }}>
      {/* [CHANGED] Full-width background, centered content shell */}
      <div style={{ width: '100%', maxWidth: scenarioMaxWidth, margin: '0 auto' }}>
        {/* Progress */}
        <ProgressBar current={currentTaskIndex + 1} total={TASKS.length} />

        {/* Context Card */}
        <div style={{
          background: '#12171f',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '16px',
          display: 'flex',
          gap: '20px',
          alignItems: 'center'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: '#718096', marginBottom: '3px' }}>
              SCENARIO {currentTaskIndex + 1}
            </div>
            <div style={{ fontSize: '14px', marginBottom: '4px' }}>
              {currentTask.human_task}
            </div>
            <div style={{ fontSize: '13px', color: '#00d9ff' }}>
              {currentTask.robot_task}
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            gap: '14px',
            fontSize: '11px',
            color: '#a0aec0'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '3px' }}>Urgency</div>
              <div style={{ color: currentTask.x_urgency > 0.5 ? '#e94560' : '#4a5568', fontWeight: 500 }}>
                {currentTask.x_urgency > 0.5 ? '● High' : '○ Low'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '3px' }}>Relevance</div>
              <div style={{ color: currentTask.x_relev > 0.5 ? '#48bb78' : '#4a5568', fontWeight: 500 }}>
                {currentTask.x_relev > 0.5 ? '● High' : '○ Low'}
              </div>
            </div>
          </div>
        </div>

        {/* Full Simulation */}
        <div style={{
          background: '#12171f',
          borderRadius: '10px',
          padding: '14px',
          marginBottom: '16px'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
          }}>
            <div style={{ fontSize: '12px', color: '#718096' }}>
              Full Journey Preview
            </div>
            <button
              onClick={handlePlayFull}
              disabled={!allStagesComplete || isPlaying}
              style={{
                padding: '6px 14px',
                background: allStagesComplete && !isPlaying ? '#00d9ff' : '#2d3748',
                border: 'none',
                borderRadius: '6px',
                color: allStagesComplete && !isPlaying ? '#0f1419' : '#4a5568',
                cursor: allStagesComplete && !isPlaying ? 'pointer' : 'not-allowed',
                fontSize: '12px',
                fontWeight: 500
              }}
            >
              {isPlaying ? '▶ Playing...' : '▶ Play Full Sequence'}
            </button>
          </div>
          <FullSimulation
            allChoices={choices}
            task={currentTask}
            isPlaying={isPlaying}
            hoveredStage={hoveredStage}
            onComplete={() => setIsPlaying(false)}
          />
        </div>

        {/* Stage descriptions */}
        <div style={{
          border: '1px solid #2d3748',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px',
          background: '#12171f',
          display: 'grid',
          gridTemplateColumns: stageGridTemplate,
          gap: stageGridGap
        }}>
          {[
            {
              title: 'Stage 1: Departure',
              text: 'In this stage, the robot starts moving from the background and begins approaching you.'
            },
            {
              title: 'Stage 2: Approach',
              text: 'In this stage, the robot is moving toward you within your peripheral awareness, so you may start to notice it.'
            },
            {
              title: 'Stage 3: Arrival',
              text: 'In this stage, the robot reaches you and stops close enough to interact with you or deliver the item.'
            }
          ].map(({ title, text }) => (
            <div key={title} style={{ fontSize: '0.9rem', color: '#a0aec0' }}>
              <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>{title}</div>
              <div style={{ lineHeight: 1.5 }}>{text}</div>
            </div>
          ))}
        </div>

        {/* Three Stage Columns */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: stageGridTemplate, 
          gap: stageGridGap,
          marginBottom: '20px'
        }}>
          {STAGES.map((stage, idx) => (
            <StageColumn
              key={stage}
              stage={stage}
              stageIndex={idx}
              choices={choices[stage]}
              onChoiceChange={handleChoiceChange}
              task={currentTask}
              isComplete={isStageComplete(stage)}
              onHoverChange={setHoveredStage}
            />
          ))}
        </div>

        {/* [CHANGED] Navigation Buttons: Back + Submit */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleBackScenario}
            style={{
              padding: '14px 16px',
              background: '#1a2332',
              border: '1px solid #2d3748',
              borderRadius: '8px',
              color: '#e2e8f0',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
              minWidth: '120px'
            }}
          >
            ← Back
          </button>

          <button
            onClick={handleSubmitScenario}
            disabled={!allStagesComplete}
            style={{
              flex: 1,
              padding: '14px',
              background: allStagesComplete ? '#00d9ff' : '#2d3748',
              border: 'none',
              borderRadius: '8px',
              color: allStagesComplete ? '#0f1419' : '#4a5568',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: allStagesComplete ? 'pointer' : 'not-allowed'
            }}
          >
            {currentTaskIndex < TASKS.length - 1
              ? 'Submit & Continue to Next Scenario'
              : 'Submit & Complete Study'}
          </button>
        </div>
      </div>
    </div>
  );
}
