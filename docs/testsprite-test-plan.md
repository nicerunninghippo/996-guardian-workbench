# TestSprite browser test plan

Target: the publicly deployed 996 Guardian Automation Workbench. All execution uses a deterministic simulator. No sign-in is required. Test runs must begin with a page reload and a saved default configuration, or use a fresh browser context. Clicking Load scenario resets the selected instance; advance time through the explicit buttons instead of waiting in wall-clock time.

Use visible semantic controls and stable data-testid hooks. Do not infer success from the application title. Verify resulting state and command evidence.

1. **Healthy route:** Agent 01, level79, goal17:37, healthy scenario. Start; advance10 twice. Assert a verified coordinate event precedes the first entrance command, Base route was selected and Automatic is confirmed.
2. **Primary entrance missing:** Load the missing-entrance scenario, Start, advance60 twice. Assert a fallback event at the 60s search deadline and a Forest route arrival; no guessed Base entry.
3. **No click feedback:** Load Click without feedback; advance60. Assert the single Base entrance click expires in12s and ownership moves to Forest. No repeated Base entry command.
4. **Arrival timeout:** Load Entry without arrival; advance60. Assert Base entry is issued once, arrival times out after25s and Forest becomes eligible. A failed wait must not refill the Base spending budget.
5. **Per-instance configuration:** Save Agent01 goal17:37 and Agent02 goal20:35. Switch instances and reload. Each retains its own coordinates. Saving pauses the edited instance.
6. **Isolation during replay:** Run Agent01 to60s. Switch to Agent02. Its virtual clock is0, entries0 and evidence belongs only toAgent02.
7. **Level eligibility:** Save level78, Start, advance20s. The first entry must be Forest, never Base.
8. **Automatic restoration:** Load Automatic mode turns off. Start and advance40s. Verify the observed Hanging state causes one restoration command followed by confirmed Automatic; a lingering orange activity label is not evidence.
9. **Overlay handling:** Load Reward overlay. Advance through work. Verify blank-area dismissal and a disappeared overlay before other tasks resume.
10. **Pause:** Start, advance10s, Pause. Clock and entry counters remain unchanged. Step buttons are disabled. Resume continues the same instance.
11. **Token priority:** Default token setting enabled. Advance enough to run a BOSS. Forest Captain token challenge takes precedence; resources decrement once at confirmation. Disable token preference and verify unrefreshed token-only candidates cannot be selected.
12. **Invalid priority configuration:** Give Base and Forest the same priority. Saving must show a validation error and preserve the old working configuration.

Record actual failures, fix their causes and rerun. Do not manufacture a red/green history or substitute local Node checks for TestSprite runs. Export or link actual generated cases and real execution reports when available.
