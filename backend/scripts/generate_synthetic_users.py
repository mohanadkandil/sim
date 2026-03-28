#!/usr/bin/env python3
"""
Synthetic User Data Generator for Lovable
Generates Mixpanel-style user profiles and event data for simulation

Usage:
    python generate_synthetic_users.py --users 500 --output ../data/lovable_users.json
"""

import json
import random
import argparse
from datetime import datetime, timedelta
from typing import List, Dict, Any
import hashlib


# ============== Configuration ==============

PRODUCT_NAME = "Lovable"
PRODUCT_DESCRIPTION = "AI-powered app builder that lets you create web apps from natural language prompts"

# Feature list for the product
FEATURES = [
    {"id": "prompt_to_app", "name": "Prompt to App", "category": "core", "complexity": "simple"},
    {"id": "visual_editor", "name": "Visual Editor", "category": "core", "complexity": "medium"},
    {"id": "code_export", "name": "Code Export", "category": "advanced", "complexity": "complex"},
    {"id": "deploy_hosting", "name": "Deploy & Hosting", "category": "core", "complexity": "simple"},
    {"id": "custom_domain", "name": "Custom Domain", "category": "advanced", "complexity": "medium"},
    {"id": "database_integration", "name": "Database Integration", "category": "advanced", "complexity": "complex"},
    {"id": "auth_users", "name": "User Authentication", "category": "advanced", "complexity": "complex"},
    {"id": "api_connect", "name": "API Connections", "category": "advanced", "complexity": "complex"},
    {"id": "templates", "name": "Templates", "category": "core", "complexity": "simple"},
    {"id": "ai_suggestions", "name": "AI Suggestions", "category": "core", "complexity": "medium"},
    {"id": "version_history", "name": "Version History", "category": "pro", "complexity": "medium"},
    {"id": "team_collab", "name": "Team Collaboration", "category": "pro", "complexity": "complex"},
]

# Plan types
PLANS = [
    {"id": "free", "name": "Free", "price": 0, "limits": {"projects": 3, "deploys": 5}},
    {"id": "starter", "name": "Starter", "price": 20, "limits": {"projects": 10, "deploys": 50}},
    {"id": "pro", "name": "Pro", "price": 50, "limits": {"projects": -1, "deploys": -1}},
    {"id": "team", "name": "Team", "price": 100, "limits": {"projects": -1, "deploys": -1}},
]

# User segments with behavior profiles
SEGMENT_PROFILES = {
    "power_user": {
        "weight": 0.15,  # 15% of users
        "session_frequency": (5, 7),  # sessions per week
        "session_duration": (30, 120),  # minutes
        "features_used": (8, 12),  # number of features
        "plan_distribution": {"free": 0.05, "starter": 0.2, "pro": 0.5, "team": 0.25},
        "tenure_months": (6, 24),
        "churn_probability": 0.02,
        "nps_range": (8, 10),
        "support_tickets": (0, 2),
        "projects_created": (10, 50),
        "traits": {
            "patience": (0.7, 1.0),
            "tech_level": (0.8, 1.0),
            "price_sensitivity": (0.1, 0.4),
            "feature_explorer": (0.8, 1.0),
        }
    },
    "casual": {
        "weight": 0.40,
        "session_frequency": (1, 3),
        "session_duration": (10, 45),
        "features_used": (3, 6),
        "plan_distribution": {"free": 0.4, "starter": 0.45, "pro": 0.12, "team": 0.03},
        "tenure_months": (2, 12),
        "churn_probability": 0.08,
        "nps_range": (5, 8),
        "support_tickets": (0, 3),
        "projects_created": (2, 10),
        "traits": {
            "patience": (0.4, 0.7),
            "tech_level": (0.3, 0.7),
            "price_sensitivity": (0.4, 0.7),
            "feature_explorer": (0.3, 0.6),
        }
    },
    "new_user": {
        "weight": 0.25,
        "session_frequency": (2, 5),
        "session_duration": (15, 60),
        "features_used": (2, 5),
        "plan_distribution": {"free": 0.7, "starter": 0.25, "pro": 0.04, "team": 0.01},
        "tenure_months": (0, 2),
        "churn_probability": 0.15,
        "nps_range": (5, 9),
        "support_tickets": (1, 5),
        "projects_created": (1, 5),
        "traits": {
            "patience": (0.5, 0.9),
            "tech_level": (0.2, 0.8),
            "price_sensitivity": (0.5, 0.9),
            "feature_explorer": (0.6, 0.9),
        }
    },
    "churned": {
        "weight": 0.20,
        "session_frequency": (0, 1),
        "session_duration": (0, 15),
        "features_used": (1, 3),
        "plan_distribution": {"free": 0.6, "starter": 0.3, "pro": 0.08, "team": 0.02},
        "tenure_months": (1, 8),
        "churn_probability": 1.0,
        "nps_range": (1, 5),
        "support_tickets": (0, 8),
        "projects_created": (0, 3),
        "traits": {
            "patience": (0.1, 0.4),
            "tech_level": (0.1, 0.5),
            "price_sensitivity": (0.6, 1.0),
            "feature_explorer": (0.1, 0.4),
        }
    }
}

# Churn reasons
CHURN_REASONS = [
    "Too expensive for my needs",
    "Found a simpler alternative",
    "Technical issues and bugs",
    "Missing features I needed",
    "Learning curve too steep",
    "Project completed, no longer needed",
    "Company downsizing",
    "Switched to custom development",
    "Performance issues",
    "Poor customer support experience",
]

# Bio templates by segment
BIO_TEMPLATES = {
    "power_user": [
        "Full-stack developer building SaaS products. Uses {product} daily to prototype and ship MVPs fast.",
        "Startup founder who's shipped 12+ apps using {product}. Loves the AI-first approach.",
        "Agency owner using {product} to deliver client projects 3x faster than traditional development.",
        "Indie hacker with multiple micro-SaaS products, all built on {product}.",
        "Tech lead who introduced {product} to the entire engineering team.",
        "Serial entrepreneur who's raised $2M for apps built entirely on {product}.",
        "Developer advocate who creates tutorials about {product} on YouTube.",
        "Product manager turned builder, shipping features without waiting for dev team.",
    ],
    "casual": [
        "Marketing manager who built the company landing page without any coding.",
        "Small business owner with a custom booking app for the salon.",
        "Freelance designer who adds interactive prototypes to client presentations.",
        "Teacher who created an app for classroom management.",
        "Real estate agent with a custom property showcase app.",
        "Non-profit coordinator managing volunteer signups through a custom app.",
        "Hobbyist who built an app to track home brewing recipes.",
        "Consultant who creates simple tools for client workshops.",
    ],
    "new_user": [
        "Just discovered {product} and excited to build my first app!",
        "Designer exploring no-code tools to bring ideas to life.",
        "Student working on a capstone project, trying AI app builders.",
        "Career switcher learning to build tech products.",
        "Curious entrepreneur evaluating {product} for a side project.",
        "First-time founder figuring out how to build an MVP.",
        "Developer from another stack, curious about AI-assisted building.",
        "Product person who wants to prototype ideas before pitching to dev team.",
    ],
    "churned": [
        "Tried {product} but the learning curve was too steep for my needs.",
        "Built one project but found the pricing didn't scale well for my use case.",
        "Loved the concept but needed more advanced database features.",
        "Moved to a competitor with better team collaboration tools.",
        "Project finished, might come back for the next one.",
        "Company decided to go with custom development instead.",
        "Had issues with deployment reliability, switched platforms.",
        "Great for prototypes but needed more control for production.",
    ]
}

# Status templates
STATUS_TEMPLATES = {
    "power_user": [
        "Pro user for {tenure} months • {projects} apps shipped",
        "Team plan • {projects} active projects",
        "Building in public • {projects} apps launched",
        "Power user since {year} • {projects} deployments",
    ],
    "casual": [
        "Starter plan • {projects} projects",
        "Using {product} for {tenure} months",
        "Weekend builder • {projects} apps",
        "Part-time creator • {tenure}mo tenure",
    ],
    "new_user": [
        "New to {product} • Exploring features",
        "Signed up {tenure} weeks ago",
        "Building first app",
        "Free plan • Getting started",
    ],
    "churned": [
        "Last active {days_ago} days ago",
        "Account inactive • Was on {plan} plan",
        "Churned after {tenure} months",
        "Previously {plan} plan user",
    ]
}

# First and last names for generating realistic user names
FIRST_NAMES = [
    "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Avery",
    "Emma", "Liam", "Olivia", "Noah", "Ava", "Sophia", "Jackson", "Lucas",
    "Mia", "Ethan", "Isabella", "Mason", "Charlotte", "Logan", "Amelia", "James",
    "Harper", "Benjamin", "Evelyn", "Michael", "Abigail", "Daniel", "Emily", "Henry",
    "Sarah", "David", "Jennifer", "Chris", "Amanda", "Matt", "Jessica", "Ryan",
    "Ashley", "Kevin", "Michelle", "Brian", "Stephanie", "Mark", "Nicole", "Eric",
    "Priya", "Raj", "Wei", "Yuki", "Hiroshi", "Mei", "Chen", "Aisha", "Omar",
    "Fatima", "Ahmed", "Sara", "Ali", "Noor", "Hassan", "Zara", "Tariq"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "White", "Harris",
    "Martin", "Thompson", "Robinson", "Clark", "Lewis", "Lee", "Walker", "Hall",
    "Young", "Allen", "King", "Wright", "Scott", "Green", "Baker", "Adams",
    "Nelson", "Hill", "Campbell", "Mitchell", "Roberts", "Carter", "Phillips", "Evans",
    "Patel", "Kumar", "Singh", "Chen", "Wang", "Zhang", "Kim", "Park",
    "Tanaka", "Sato", "Ahmed", "Ali", "Khan", "Hassan", "Ibrahim", "Okafor"
]

# Company types for work context
COMPANY_TYPES = [
    "startup", "agency", "enterprise", "freelance", "non-profit",
    "education", "healthcare", "fintech", "e-commerce", "saas"
]

# Locations
LOCATIONS = [
    "San Francisco, CA", "New York, NY", "Austin, TX", "Seattle, WA", "Boston, MA",
    "Los Angeles, CA", "Chicago, IL", "Denver, CO", "Miami, FL", "Portland, OR",
    "London, UK", "Berlin, Germany", "Paris, France", "Amsterdam, Netherlands",
    "Toronto, Canada", "Sydney, Australia", "Singapore", "Tokyo, Japan",
    "Bangalore, India", "Tel Aviv, Israel", "Dubai, UAE", "Stockholm, Sweden",
    "Remote", "Remote (US)", "Remote (EU)", "Remote (APAC)"
]


# ============== Generator Functions ==============

def generate_user_id() -> str:
    """Generate a unique user ID"""
    return hashlib.md5(f"{random.random()}{datetime.now().timestamp()}".encode()).hexdigest()[:12]


def weighted_choice(options: Dict[str, float]) -> str:
    """Choose from options based on weights"""
    items = list(options.items())
    weights = [w for _, w in items]
    return random.choices([k for k, _ in items], weights=weights)[0]


def random_range(range_tuple: tuple) -> float:
    """Get random value in range"""
    return random.uniform(range_tuple[0], range_tuple[1])


def random_int_range(range_tuple: tuple) -> int:
    """Get random integer in range"""
    return random.randint(range_tuple[0], range_tuple[1])


def generate_events(user: Dict, segment_profile: Dict, days_back: int = 90) -> List[Dict]:
    """Generate event history for a user"""
    events = []

    if segment_profile.get("churn_probability", 0) >= 1.0:
        # Churned user - fewer events, concentrated in the past
        days_back = random.randint(30, 180)
        active_days = random.randint(7, 60)
    else:
        active_days = days_back

    # Calculate events based on session frequency
    sessions_per_week = random_int_range(segment_profile["session_frequency"])
    total_sessions = (active_days / 7) * sessions_per_week

    features_used = random.sample(FEATURES, min(len(FEATURES), random_int_range(segment_profile["features_used"])))

    for _ in range(int(total_sessions)):
        event_date = datetime.now() - timedelta(
            days=random.randint(0 if segment_profile.get("churn_probability", 0) < 1.0 else 30, days_back)
        )

        session_duration = random_int_range(segment_profile["session_duration"])

        # Generate session events
        session_events = []

        # Session start
        session_events.append({
            "event": "session_start",
            "timestamp": event_date.isoformat(),
            "properties": {"duration_minutes": session_duration}
        })

        # Feature usage during session
        features_in_session = random.sample(features_used, min(len(features_used), random.randint(1, 4)))
        for feature in features_in_session:
            session_events.append({
                "event": "feature_used",
                "timestamp": (event_date + timedelta(minutes=random.randint(1, session_duration))).isoformat(),
                "properties": {
                    "feature_id": feature["id"],
                    "feature_name": feature["name"],
                    "category": feature["category"]
                }
            })

        # Maybe a project action
        if random.random() < 0.3:
            action = random.choice(["project_created", "project_deployed", "project_edited"])
            session_events.append({
                "event": action,
                "timestamp": (event_date + timedelta(minutes=random.randint(5, session_duration))).isoformat(),
                "properties": {"project_id": f"proj_{generate_user_id()[:8]}"}
            })

        events.extend(session_events)

    # Sort by timestamp
    events.sort(key=lambda x: x["timestamp"])

    return events


def generate_user(segment: str) -> Dict[str, Any]:
    """Generate a single synthetic user"""
    profile = SEGMENT_PROFILES[segment]

    user_id = generate_user_id()
    first_name = random.choice(FIRST_NAMES)
    last_name = random.choice(LAST_NAMES)

    # Determine tenure
    tenure_months = random_int_range(profile["tenure_months"])
    signup_date = datetime.now() - timedelta(days=tenure_months * 30)

    # Determine plan
    plan_id = weighted_choice(profile["plan_distribution"])
    plan = next(p for p in PLANS if p["id"] == plan_id)

    # Generate traits
    traits = {
        "patience": round(random_range(profile["traits"]["patience"]), 2),
        "tech_level": round(random_range(profile["traits"]["tech_level"]), 2),
        "price_sensitivity": round(random_range(profile["traits"]["price_sensitivity"]), 2),
        "feature_explorer": round(random_range(profile["traits"]["feature_explorer"]), 2),
    }

    # Projects created
    projects_created = random_int_range(profile["projects_created"])

    # NPS score
    nps_score = random_int_range(profile["nps_range"])

    # Generate bio
    bio_template = random.choice(BIO_TEMPLATES[segment])
    bio = bio_template.format(product=PRODUCT_NAME)

    # Generate status
    status_template = random.choice(STATUS_TEMPLATES[segment])
    status = status_template.format(
        product=PRODUCT_NAME,
        tenure=tenure_months,
        projects=projects_created,
        plan=plan["name"],
        year=signup_date.year,
        days_ago=random.randint(14, 90) if segment == "churned" else 0
    )

    # Churn info
    churned = segment == "churned" or random.random() < profile["churn_probability"]
    churn_reason = random.choice(CHURN_REASONS) if churned else None

    # Last activity
    if churned:
        last_active = datetime.now() - timedelta(days=random.randint(14, 180))
    else:
        last_active = datetime.now() - timedelta(days=random.randint(0, 7))

    user = {
        "id": user_id,
        "name": f"{first_name} {last_name}",
        "email": f"{first_name.lower()}.{last_name.lower()}@{random.choice(['gmail.com', 'company.com', 'startup.io', 'agency.co', 'outlook.com'])}",
        "segment": segment,
        "plan": plan,
        "signup_date": signup_date.isoformat(),
        "last_active": last_active.isoformat(),
        "tenure_months": tenure_months,
        "location": random.choice(LOCATIONS),
        "company_type": random.choice(COMPANY_TYPES),
        "traits": traits,
        "metrics": {
            "projects_created": projects_created,
            "projects_deployed": max(0, projects_created - random.randint(0, 3)),
            "total_sessions": random_int_range((tenure_months * 4, tenure_months * 30)),
            "avg_session_minutes": random_int_range(profile["session_duration"]),
            "features_used_count": random_int_range(profile["features_used"]),
            "support_tickets": random_int_range(profile["support_tickets"]),
            "nps_score": nps_score,
            "referrals": random.randint(0, 3) if segment == "power_user" else 0,
        },
        "features_used": [f["id"] for f in random.sample(FEATURES, random_int_range(profile["features_used"]))],
        "bio": bio,
        "status": status,
        "churned": churned,
        "churn_reason": churn_reason,
        "sentiment": "positive" if nps_score >= 8 else ("negative" if nps_score <= 4 else "neutral"),
    }

    # Generate events (optional, can be heavy)
    # user["events"] = generate_events(user, profile)

    return user


def generate_users(count: int, include_events: bool = False) -> List[Dict[str, Any]]:
    """Generate multiple synthetic users"""
    users = []

    # Calculate counts per segment
    segment_counts = {}
    remaining = count

    for segment, profile in SEGMENT_PROFILES.items():
        segment_count = int(count * profile["weight"])
        segment_counts[segment] = segment_count
        remaining -= segment_count

    # Distribute remaining to largest segment
    segment_counts["casual"] += remaining

    # Generate users
    for segment, segment_count in segment_counts.items():
        print(f"Generating {segment_count} {segment} users...")
        for _ in range(segment_count):
            user = generate_user(segment)
            if include_events:
                user["events"] = generate_events(user, SEGMENT_PROFILES[segment])
            users.append(user)

    # Shuffle to mix segments
    random.shuffle(users)

    return users


def generate_summary(users: List[Dict]) -> Dict[str, Any]:
    """Generate summary statistics"""
    segments = {}
    for user in users:
        seg = user["segment"]
        if seg not in segments:
            segments[seg] = {"count": 0, "avg_nps": 0, "churned": 0, "revenue": 0}
        segments[seg]["count"] += 1
        segments[seg]["avg_nps"] += user["metrics"]["nps_score"]
        segments[seg]["churned"] += 1 if user["churned"] else 0
        segments[seg]["revenue"] += user["plan"]["price"]

    for seg in segments:
        if segments[seg]["count"] > 0:
            segments[seg]["avg_nps"] = round(segments[seg]["avg_nps"] / segments[seg]["count"], 1)
            segments[seg]["churn_rate"] = round(segments[seg]["churned"] / segments[seg]["count"] * 100, 1)

    return {
        "total_users": len(users),
        "segments": segments,
        "total_mrr": sum(u["plan"]["price"] for u in users if not u["churned"]),
        "avg_tenure_months": round(sum(u["tenure_months"] for u in users) / len(users), 1),
        "overall_nps": round(sum(u["metrics"]["nps_score"] for u in users) / len(users), 1),
        "features": FEATURES,
        "plans": PLANS,
        "product": {
            "name": PRODUCT_NAME,
            "description": PRODUCT_DESCRIPTION
        }
    }


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic user data for Lovable")
    parser.add_argument("--users", type=int, default=500, help="Number of users to generate")
    parser.add_argument("--output", type=str, default="../data/lovable_users.json", help="Output file path")
    parser.add_argument("--events", action="store_true", help="Include event history (larger file)")

    args = parser.parse_args()

    print(f"Generating {args.users} synthetic users for {PRODUCT_NAME}...")

    users = generate_users(args.users, include_events=args.events)
    summary = generate_summary(users)

    output = {
        "generated_at": datetime.now().isoformat(),
        "summary": summary,
        "users": users
    }

    # Ensure output directory exists
    import os
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nGenerated {len(users)} users")
    print(f"Saved to: {args.output}")
    print(f"\nSummary:")
    print(f"  Total MRR: ${summary['total_mrr']}")
    print(f"  Avg NPS: {summary['overall_nps']}")
    print(f"  Avg Tenure: {summary['avg_tenure_months']} months")
    print(f"\nSegment Breakdown:")
    for seg, data in summary["segments"].items():
        print(f"  {seg}: {data['count']} users, {data['churn_rate']}% churn, NPS {data['avg_nps']}")


if __name__ == "__main__":
    main()
