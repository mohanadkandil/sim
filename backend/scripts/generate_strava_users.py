"""Generate synthetic Strava user data for simulation"""
import json
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)

FEATURES = [
    {"id": "activity_recording", "name": "Activity Recording", "category": "core", "complexity": "simple"},
    {"id": "gps_tracking", "name": "GPS Tracking", "category": "core", "complexity": "simple"},
    {"id": "segments", "name": "Segments & KOMs", "category": "core", "complexity": "medium"},
    {"id": "routes", "name": "Route Builder", "category": "core", "complexity": "medium"},
    {"id": "clubs", "name": "Clubs", "category": "social", "complexity": "simple"},
    {"id": "training_plans", "name": "Training Plans", "category": "summit", "complexity": "medium"},
    {"id": "beacon", "name": "Beacon (Live Tracking)", "category": "summit", "complexity": "simple"},
    {"id": "heart_rate", "name": "Heart Rate Analysis", "category": "summit", "complexity": "complex"},
    {"id": "power_analysis", "name": "Power Meter Analysis", "category": "summit", "complexity": "complex"},
    {"id": "annual_summary", "name": "Year in Sport", "category": "core", "complexity": "simple"},
    {"id": "heatmaps", "name": "Personal Heatmaps", "category": "summit", "complexity": "medium"},
    {"id": "challenges", "name": "Monthly Challenges", "category": "core", "complexity": "simple"},
]

PLANS = [
    {"id": "free", "name": "Free", "price": 0},
    {"id": "summit", "name": "Summit", "price": 8},
]

SPORT_TYPES = ["running", "cycling", "triathlon", "swimming", "hiking", "trail running"]

CHURN_REASONS = [
    "Garmin Connect has better analytics for my device",
    "Apple Fitness+ gives me everything I need for free",
    "Strava started charging for features that used to be free",
    "Privacy concerns about sharing location data",
    "Moved to Polar Flow for better heart rate analysis",
    "Too many ads and upsells on the free tier",
    "My running club switched to a different platform",
    "The feed became too crowded with irrelevant activities",
]

BIOS_POWER = [
    "Marathon runner chasing a sub-3:00. Logs every mile, checks segments obsessively.",
    "Cyclist doing 300km/week. Lives for KOM battles on local climbs.",
    "Triathlete training for an Ironman. Uses Strava to coordinate swim, bike, and run blocks.",
    "Ultra-runner with 5 podium finishes. Routes every trail race and shares GPX files.",
    "Road cyclist, club captain, uses Strava clubs to manage group ride schedules.",
    "Masters runner, tracks heart rate zones religiously, competes in age-group segments.",
    "Track cyclist who maps every sprint effort and posts power data after each session.",
    "Duathlete using training plans to peak for spring season, follows power-to-weight obsessively.",
]

BIOS_CASUAL = [
    "Runner trying to stay consistent with 3 runs per week.",
    "Weekend cyclist who enjoys exploring new routes in the countryside.",
    "Jogger who mainly uses Strava to track distance and share with friends.",
    "Hiker using Strava to log trail walks and keep a record of elevation.",
    "Someone who joined after a friend challenged them to a monthly run challenge.",
    "Occasional swimmer logging open water swims in the summer.",
    "Parent doing 5K runs a few times a week to de-stress.",
    "Commuter cyclist using Strava to track work rides and measure progress.",
]

BIOS_NEW = [
    "Just started running after years off. Trying to build up to a 5K.",
    "New to Strava after getting a GPS watch for their birthday.",
    "Started cycling recently and a friend recommended Strava.",
    "Training for first half marathon, using Strava to stay accountable.",
    "Joined a running club that uses Strava for group activities.",
    "Signed up to track a charity walk. Now curious about the training features.",
    "Started hiking more and wants to log routes to revisit them.",
    "Downloaded Strava after seeing it mentioned on a running podcast.",
]

BIOS_CHURNED = [
    "Used Strava for 2 years but switched to Garmin Connect when they locked segments.",
    "Left when Summit pricing doubled without new features.",
    "Moved to Apple Fitness+ — it integrates better with my Watch.",
    "The social feed got overwhelming. Wanted just training data.",
    "Privacy issues with public by default activities.",
    "Switched to Polar after buying a new HR monitor.",
    "Stopped paying when free tier removed leaderboards.",
    "Coach switched the team to TrainingPeaks, so followed along.",
]

LOCATIONS = [
    "London, UK", "New York, NY", "Amsterdam, Netherlands", "Berlin, Germany",
    "Sydney, Australia", "San Francisco, CA", "Tokyo, Japan", "Barcelona, Spain",
    "Paris, France", "Toronto, Canada", "Melbourne, Australia", "Seattle, WA",
    "Stockholm, Sweden", "Oslo, Norway", "Copenhagen, Denmark", "Zurich, Switzerland",
    "Boston, MA", "Chicago, IL", "Portland, OR", "Austin, TX",
]

FIRST_NAMES = [
    "Emma", "Liam", "Sophia", "Noah", "Olivia", "James", "Ava", "Lucas",
    "Mia", "Ethan", "Charlotte", "Mason", "Amelia", "Logan", "Harper",
    "Aiden", "Evelyn", "Jackson", "Abigail", "Sebastian", "Emily", "Carter",
    "Ella", "Owen", "Scarlett", "Wyatt", "Grace", "Hunter", "Chloe", "Jayden",
    "Riley", "Gabriel", "Zoey", "Dylan", "Nora", "Joshua", "Lily", "Andrew",
    "Eleanor", "Lincoln", "Hannah", "Ryan", "Lillian", "Nathan", "Addison",
    "Caleb", "Aubrey", "Connor", "Ellie", "Eli", "Stella", "Isaac", "Natalie",
    "Leo", "Zoe", "Julian", "Leah", "Hudson", "Hazel", "Ezra", "Violet",
    "Oliver", "Aurora", "Kai", "Luna", "Miles", "Savannah", "Axel", "Audrey",
    "Ryder", "Brooklyn", "Finn", "Bella", "Declan", "Claire", "Rowan", "Skylar",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Wilson", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore", "Martin",
    "Jackson", "Thompson", "White", "Lopez", "Lee", "Harris", "Clark", "Lewis",
    "Robinson", "Walker", "Hall", "Allen", "Young", "Scott", "King",
    "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Rivera",
    "Campbell", "Mitchell", "Carter", "Roberts", "Gomez", "Phillips", "Evans",
    "Turner", "Diaz", "Parker", "Cruz", "Edwards", "Collins", "Reyes", "Stewart",
    "Morris", "Sanchez", "Torres", "Ramirez", "Reed", "Bailey", "Kelly", "Howard",
    "Chen", "Patel", "Kim", "Singh", "Mueller", "Jensen", "Hansen", "Larsen",
]

used_names = set()

def make_name():
    for _ in range(100):
        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        if name not in used_names:
            used_names.add(name)
            return name
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"

def make_user(segment):
    name = make_name()
    first = name.split()[0].lower()
    last = name.split()[1].lower()
    domains = ["gmail.com", "outlook.com", "icloud.com", "proton.me", "yahoo.com"]
    email = f"{first}.{last}@{random.choice(domains)}"
    uid = uuid.uuid4().hex[:12]

    now = datetime(2026, 4, 24)

    if segment == "power_user":
        tenure = random.randint(12, 36)
        plan = PLANS[1]
        nps = random.randint(7, 10)
        activities_per_month = random.randint(20, 60)
        features_used = random.sample(
            ["activity_recording", "gps_tracking", "segments", "routes", "clubs",
             "training_plans", "heart_rate", "power_analysis", "heatmaps", "challenges"],
            k=random.randint(5, 9)
        )
        patience = round(random.uniform(0.6, 1.0), 2)
        tech_level = round(random.uniform(0.65, 1.0), 2)
        price_sensitivity = round(random.uniform(0.1, 0.5), 2)
        sport = random.choice(["running", "cycling", "triathlon", "trail running"])
        bio = random.choice(BIOS_POWER)
        km_logged = random.randint(3000, 15000)
        status = f"Summit • {km_logged:,}km logged"
        churned = False
        churn_reason = None
        sentiment = random.choice(["positive", "positive", "positive", "neutral"])

    elif segment == "casual":
        tenure = random.randint(3, 24)
        plan = random.choice([PLANS[0], PLANS[0], PLANS[0], PLANS[1]])
        nps = random.randint(5, 9)
        activities_per_month = random.randint(4, 16)
        features_used = random.sample(
            ["activity_recording", "gps_tracking", "segments", "challenges", "clubs", "routes"],
            k=random.randint(2, 5)
        )
        patience = round(random.uniform(0.4, 0.8), 2)
        tech_level = round(random.uniform(0.2, 0.7), 2)
        price_sensitivity = round(random.uniform(0.3, 0.8), 2)
        sport = random.choice(["running", "cycling", "hiking", "running"])
        bio = random.choice(BIOS_CASUAL)
        km_logged = random.randint(200, 2500)
        status = f"{plan['name']} • {activities_per_month} activities/month"
        churned = False
        churn_reason = None
        sentiment = random.choice(["positive", "neutral", "neutral"])

    elif segment == "new_user":
        tenure = random.randint(1, 4)
        plan = random.choice([PLANS[0], PLANS[0], PLANS[1]])
        nps = random.randint(5, 9)
        activities_per_month = random.randint(2, 12)
        features_used = random.sample(
            ["activity_recording", "gps_tracking", "challenges"],
            k=random.randint(1, 3)
        )
        patience = round(random.uniform(0.3, 0.7), 2)
        tech_level = round(random.uniform(0.2, 0.7), 2)
        price_sensitivity = round(random.uniform(0.5, 1.0), 2)
        sport = random.choice(["running", "cycling", "hiking"])
        bio = random.choice(BIOS_NEW)
        km_logged = random.randint(20, 300)
        status = f"New runner • {km_logged}km so far"
        churned = False
        churn_reason = None
        sentiment = random.choice(["positive", "positive", "neutral"])

    else:  # churned
        tenure = random.randint(1, 18)
        plan = random.choice(PLANS)
        nps = random.randint(1, 5)
        activities_per_month = 0
        features_used = random.sample(
            ["activity_recording", "gps_tracking", "segments"],
            k=random.randint(1, 3)
        )
        patience = round(random.uniform(0.1, 0.5), 2)
        tech_level = round(random.uniform(0.2, 0.8), 2)
        price_sensitivity = round(random.uniform(0.6, 1.0), 2)
        sport = random.choice(SPORT_TYPES)
        bio = random.choice(BIOS_CHURNED)
        km_logged = random.randint(50, 3000)
        churn_reason = random.choice(CHURN_REASONS)
        status = f"Churned after {tenure} months"
        churned = True
        sentiment = random.choice(["negative", "negative", "neutral"])

    signup = now - timedelta(days=tenure * 30 + random.randint(0, 15))
    last_active = now - timedelta(days=random.randint(1, 30)) if not churned else now - timedelta(days=random.randint(60, 300))

    return {
        "id": uid,
        "name": name,
        "email": email,
        "segment": segment,
        "plan": plan,
        "signup_date": signup.isoformat(),
        "last_active": last_active.isoformat(),
        "tenure_months": tenure,
        "location": random.choice(LOCATIONS),
        "sport_type": sport,
        "traits": {
            "patience": patience,
            "tech_level": tech_level,
            "price_sensitivity": price_sensitivity,
            "feature_explorer": round(random.uniform(0.2, 1.0), 2),
        },
        "metrics": {
            "activities_logged": random.randint(10, 800) if not churned else random.randint(5, 200),
            "km_logged": km_logged,
            "total_sessions": random.randint(20, 400),
            "avg_session_minutes": random.randint(8, 25),
            "kudos_given": random.randint(0, 500),
            "kudos_received": random.randint(0, 300),
            "segments_tried": random.randint(0, 50) if segment in ["power_user", "casual"] else 0,
            "support_tickets": random.randint(0, 5),
            "nps_score": nps,
            "referrals": random.randint(0, 8) if segment == "power_user" else 0,
        },
        "features_used": features_used,
        "bio": bio,
        "status": status,
        "churned": churned,
        "churn_reason": churn_reason,
        "sentiment": sentiment,
    }


def generate():
    segments = {
        "power_user": 75,
        "casual": 200,
        "new_user": 125,
        "churned": 100,
    }

    users = []
    for segment, count in segments.items():
        for _ in range(count):
            users.append(make_user(segment))

    random.shuffle(users)

    def seg_users(s):
        return [u for u in users if u["segment"] == s]

    summary = {
        "total_users": len(users),
        "segments": {
            s: {
                "count": len(seg_users(s)),
                "avg_nps": round(sum(u["metrics"]["nps_score"] for u in seg_users(s)) / len(seg_users(s)), 1),
                "churned": sum(1 for u in seg_users(s) if u["churned"]),
                "churn_rate": round(100 * sum(1 for u in seg_users(s) if u["churned"]) / len(seg_users(s)), 1),
            }
            for s in segments
        },
        "overall_nps": round(sum(u["metrics"]["nps_score"] for u in users) / len(users), 1),
        "avg_tenure_months": round(sum(u["tenure_months"] for u in users) / len(users), 1),
        "features": FEATURES,
        "plans": PLANS,
        "product": {
            "name": "Strava",
            "description": "Social fitness app for runners and cyclists to track activities, compete on segments, and connect with athletes worldwide",
        },
    }

    data = {"generated_at": datetime.now().isoformat(), "summary": summary, "users": users}

    out = Path(__file__).parent.parent / "data" / "strava_users.json"
    out.parent.mkdir(exist_ok=True)
    with open(out, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Generated {len(users)} Strava users → {out}")
    for s, info in summary["segments"].items():
        print(f"  {s}: {info['count']} users, avg NPS {info['avg_nps']}")


if __name__ == "__main__":
    generate()
