// The GroundZero logo leads to the landing page. A running Capture, debrief or Teach session asks first.
document.querySelector('a.brand')?.addEventListener('click', (e) => {
  const live = document.getElementById('voice');
  if (live && !live.hidden && !confirm('A session is still running. Leave and lose it?')) e.preventDefault();
});
