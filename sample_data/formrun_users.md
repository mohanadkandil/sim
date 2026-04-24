# FormRun Product & User Data

## Product Overview

FormRun is an AI-powered running coach that delivers real-time biomechanical feedback through AirPods while you run. Using the motion sensors in your phone and earbuds, it detects overstriding, asymmetric loading, and high-impact patterns — then speaks short, precise corrections at the exact moment they matter. After each run, it shows a breakdown of where form broke down, how the body compensated over time, and a personalized injury risk score. No wearables or extra devices required.

## User Segments

### Dedicated Runners (1,204 users)
- Average 18 sessions per month
- Primary use: Injury prevention and form improvement across long training blocks
- Most used features: Real-time audio cues, post-run form breakdown, injury risk score
- Pain points: Audio cues occasionally fire too frequently during hard efforts, want intensity control
- Satisfaction: 4.5/5

### Comeback Runners (639 users)
- Returning after an injury; highly motivated by risk monitoring
- Average 12 sessions per month
- Primary use: Safe return to training with guardrails on load and impact
- Most used features: Injury risk score, left/right load balance, weekly trend charts
- Pain points: Anxious about re-injury; want more granular explanation of risk scores
- Satisfaction: 4.6/5

### Casual Joggers (872 users)
- Average 5 sessions per month
- Primary use: General fitness; not training for a race
- Most used features: Post-run summary, stride cues
- Pain points: Too much technical terminology in the post-run report
- Satisfaction: 4.2/5

### Churned Users (347 users)
- Left within first 45 days
- Top reasons for leaving:
  - Audio cues felt distracting mid-run (48%)
  - Didn't notice form improvement fast enough (31%)
  - Wanted GPS and pace tracking bundled in (21%)
- Common feedback: "I just wanted something simpler"

### New Users (514 users)
- Joined in last 30 days
- Onboarding completion rate: 74%
- Most common first run type: Easy 5km
- Drop-off point: After first post-run report — overwhelmed by metrics

## Key Features

### Real-Time Audio Cues
- Speaks short corrections during the run via AirPods
- Detects overstriding, impact spikes, and lateral imbalance
- Cue frequency adapts to pace and effort level
- User rating: 4.4/5

### Post-Run Form Breakdown
- Timeline showing where form degraded during the run
- Highlights compensation patterns (e.g. hip drop when left side fatigues)
- Exportable as PDF for sharing with coaches or physios
- User rating: 4.6/5

### Injury Risk Score
- 0–100 score updated after each run
- Factors in recent load, asymmetry trends, and impact accumulation
- Color-coded alerts (green / amber / red)
- Known issues: Score can spike unexpectedly after treadmill runs due to sensor calibration
- User rating: 4.1/5

### Weekly Training Load Chart
- Tracks cumulative stress across the week
- Flags overload before it becomes injury
- Compares current week to personal baseline
- User rating: 4.3/5

## User Feedback Samples

### Lena Hoffmann (Dedicated Runner)
"I've been running for 8 years and never thought about my left-right balance. FormRun showed me I was loading my right side 18% more than my left. Three weeks later my knee pain is gone."

### Tom Adeyemi (Comeback Runner)
"Coming back from a stress fracture, I was terrified of re-injury. The risk score gave me something concrete to watch. When it crept into amber I backed off. It's been 4 months injury-free."

### Claire Bouchard (Churned)
"The idea is great but the cues came every 30 seconds and I couldn't get into a rhythm. I turned them off but then what's the point? I went back to just using Strava."

### Raj Menon (Casual Jogger)
"I jog three times a week for my health. The post-run report is a bit much — I don't know what 'cadence variance' means. But the simple risk score is useful."

### Mia Svensson (New User)
"First run with FormRun was eye-opening. I had no idea I was overstriding until the voice told me mid-run. Felt weird at first but my shins felt way better the next day."

### David Park (Dedicated Runner)
"Please add Garmin and Apple Watch integration. I use both and having to open a separate app breaks my flow. The form analysis is best-in-class though — nothing else comes close."

## Feature Requests (Last 30 Days)

1. **Adjustable Cue Frequency** - 521 requests
   - "Let me choose how often I hear cues"
   - "Silent mode with post-run summary only"
   - "Fewer cues during race-pace intervals"

2. **GPS + Pace Integration** - 398 requests
   - "Don't want two apps running at once"
   - "Show form data alongside pace and distance"
   - "Strava sync"

3. **Simpler Post-Run Report** - 276 requests
   - "One-page summary, not six tabs"
   - "Plain language explanations"
   - "Highlight just the top thing to fix"

4. **Coach/Physio Sharing** - 203 requests
   - "Export form data to send to my PT"
   - "Shareable run link"

5. **Treadmill Calibration** - 187 requests
   - "Risk score goes haywire on treadmill"
   - "Need indoor mode"

## Usage Patterns

### Peak Run Times
- 6am–8am (morning runners, weekdays)
- 12pm–1pm (lunch runners)
- Saturday 7am–10am (long run day)

### Session Duration
- Dedicated runners: 52 minutes average
- Comeback runners: 34 minutes average
- Casual joggers: 28 minutes average

### Feature Usage by Segment

| Feature | Dedicated | Comeback | Casual | New Users |
|---------|-----------|----------|--------|-----------|
| Audio Cues | 91% | 87% | 54% | 78% |
| Post-Run Breakdown | 98% | 95% | 61% | 82% |
| Injury Risk Score | 74% | 99% | 70% | 65% |
| Load Chart | 67% | 88% | 22% | 18% |
| PDF Export | 31% | 44% | 8% | 4% |

## Competitive Landscape

- **Runna**: Training plan focused, no real-time form feedback
- **Garmin Coach**: Hardware-dependent, strong GPS, no biomechanics
- **Plantiga**: Clinical-grade insole sensors, expensive, niche
- **Apple Fitness+**: General fitness, no running-specific form analysis

## Product Roadmap Considerations

### Proposed: Silent Mode (Cues Off, Post-Run Only)
- Addresses top churn reason: cue distraction
- Estimated dev time: 1 week
- No new sensor logic required

### User Sentiment on Silent Mode
- Churned users: "Would have kept me" (61%)
- Casual joggers: "Yes, I'd prefer this" (74%)
- Dedicated runners: "I like the cues but good to have the option" (58%)

### Risk Assessment
- Cue distraction is the #1 stated churn driver — a quick silent mode toggle could recover a meaningful share of churned users
- GPS integration is high-effort but frequently requested; partnership with Strava API is the lowest-friction path
- Treadmill sensor bug is damaging trust with comeback runners who rely most on the risk score — should be prioritized before new feature work
