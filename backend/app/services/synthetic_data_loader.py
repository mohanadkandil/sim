"""
Synthetic Data Loader Service
Loads pre-generated user data for agent simulation.
Used to enrich Zep entities with realistic behavioral traits.
"""

import json
import random
import os
from typing import List, Dict, Any, Optional
from pathlib import Path

# Segment colors matching frontend
SEGMENT_COLORS = {
    'power_user': '#8B5CF6',  # Purple
    'casual': '#22C55E',      # Green
    'new_user': '#FBBF24',    # Amber
    'churned': '#F97316'      # Orange
}


class SyntheticDataLoader:
    """Load and serve synthetic user data for simulations"""

    def __init__(self, data_path: Optional[str] = None):
        if data_path is None:
            # Default path relative to this file
            base_dir = Path(__file__).parent.parent.parent
            data_path = base_dir / "data" / "strava_users.json"

        self.data_path = Path(data_path)
        self._data = None
        self._users = None
        self._summary = None

    def _load_data(self):
        """Load data from file if not already loaded"""
        if self._data is None:
            if not self.data_path.exists():
                raise FileNotFoundError(f"Synthetic data file not found: {self.data_path}")

            with open(self.data_path, 'r') as f:
                self._data = json.load(f)

            self._users = self._data.get("users", [])
            self._summary = self._data.get("summary", {})

    @property
    def users(self) -> List[Dict]:
        """Get all users"""
        self._load_data()
        return self._users

    @property
    def summary(self) -> Dict:
        """Get summary statistics"""
        self._load_data()
        return self._summary

    @property
    def product_info(self) -> Dict:
        """Get product info"""
        self._load_data()
        return self._summary.get("product", {})

    @property
    def features(self) -> List[Dict]:
        """Get product features"""
        self._load_data()
        return self._summary.get("features", [])

    def get_users_by_segment(self, segment: str) -> List[Dict]:
        """Get users filtered by segment"""
        return [u for u in self.users if u["segment"] == segment]

    def get_sample_users(
        self,
        count: int = 50,
        segment_distribution: Optional[Dict[str, float]] = None
    ) -> List[Dict]:
        """
        Get a sample of users with optional segment distribution

        Args:
            count: Number of users to return
            segment_distribution: Optional dict like {"power_user": 0.2, "casual": 0.4, ...}

        Returns:
            List of sampled users
        """
        if segment_distribution is None:
            # Use natural distribution
            return random.sample(self.users, min(count, len(self.users)))

        # Sample according to distribution
        sampled = []
        for segment, ratio in segment_distribution.items():
            segment_users = self.get_users_by_segment(segment)
            segment_count = int(count * ratio)
            sampled.extend(random.sample(segment_users, min(segment_count, len(segment_users))))

        # Fill remaining with random
        remaining = count - len(sampled)
        if remaining > 0:
            available = [u for u in self.users if u not in sampled]
            sampled.extend(random.sample(available, min(remaining, len(available))))

        random.shuffle(sampled)
        return sampled[:count]

    def user_to_agent(self, user: Dict) -> Dict:
        """
        Convert a synthetic user to an agent format for the frontend

        Returns agent dict matching ForumAgent interface
        """
        return {
            "id": f"agent_{user['id']}",
            "name": user["name"],
            "avatar": None,  # Could generate avatars if needed
            "segment": user["segment"],
            "segment_color": SEGMENT_COLORS.get(user["segment"], "#8B5CF6"),
            "entity_id": user["id"],
            "entity_type": "User",
            "entity_summary": user.get("bio", ""),
            "bio": user.get("bio", ""),
            "status": user.get("status", ""),
            "location": user.get("location", "Unknown"),
            "company_type": user.get("company_type", ""),
            "plan": user.get("plan", {}).get("name", "Free"),
            "tenure_months": user.get("tenure_months", 0),
            "nps_score": user.get("metrics", {}).get("nps_score", 5),
            "projects_created": user.get("metrics", {}).get("projects_created", 0),
            "churned": user.get("churned", False),
            "churn_reason": user.get("churn_reason"),
            "sentiment": user.get("sentiment", "neutral"),
            # Traits for simulation
            "patience": user.get("traits", {}).get("patience", 0.5),
            "tech_level": user.get("traits", {}).get("tech_level", 0.5),
            "price_sensitivity": user.get("traits", {}).get("price_sensitivity", 0.5),
            "feature_explorer": user.get("traits", {}).get("feature_explorer", 0.5),
            # Features they use
            "features_used": user.get("features_used", []),
        }

    def get_agents(
        self,
        count: int = 50,
        segment_distribution: Optional[Dict[str, float]] = None
    ) -> List[Dict]:
        """
        Get agents ready for simulation

        Args:
            count: Number of agents
            segment_distribution: Optional segment weights

        Returns:
            List of agent dicts
        """
        users = self.get_sample_users(count, segment_distribution)
        return [self.user_to_agent(u) for u in users]

    def get_segment_summary(self) -> Dict[str, Dict]:
        """Get summary by segment"""
        self._load_data()
        return self._summary.get("segments", {})

    def search_users(
        self,
        query: str = None,
        segment: str = None,
        min_nps: int = None,
        max_nps: int = None,
        churned_only: bool = False,
        plan: str = None,
        limit: int = 50
    ) -> List[Dict]:
        """
        Search users with filters
        """
        results = self.users

        if segment:
            results = [u for u in results if u["segment"] == segment]

        if min_nps is not None:
            results = [u for u in results if u["metrics"]["nps_score"] >= min_nps]

        if max_nps is not None:
            results = [u for u in results if u["metrics"]["nps_score"] <= max_nps]

        if churned_only:
            results = [u for u in results if u["churned"]]

        if plan:
            results = [u for u in results if u["plan"]["id"] == plan]

        if query:
            query = query.lower()
            results = [u for u in results if
                query in u["name"].lower() or
                query in u.get("bio", "").lower() or
                query in u.get("location", "").lower()
            ]

        return results[:limit]


    def get_random_traits_for_segment(self, segment: str) -> Dict:
        """
        Get random realistic traits for a segment from synthetic data.
        Used to enrich Zep entities with behavioral data.
        """
        segment_users = self.get_users_by_segment(segment)
        if not segment_users:
            # Fallback defaults
            return self._default_traits(segment)

        # Pick a random user from this segment and extract their traits
        user = random.choice(segment_users)

        return {
            'bio': user.get('bio', ''),
            'status': user.get('status', ''),
            'patience': user.get('traits', {}).get('patience', 0.5),
            'tech_level': user.get('traits', {}).get('tech_level', 0.5),
            'price_sensitivity': user.get('traits', {}).get('price_sensitivity', 0.5),
            'feature_explorer': user.get('traits', {}).get('feature_explorer', 0.5),
            'nps_score': user.get('metrics', {}).get('nps_score', 5),
            'tenure_months': user.get('tenure_months', 1),
            'projects_created': user.get('metrics', {}).get('projects_created', 0),
            'features_used': user.get('features_used', []),
            'churn_reason': user.get('churn_reason'),
            'plan': user.get('plan', {}).get('name', 'Free'),
            'location': user.get('location', 'Unknown'),
            'company_type': user.get('company_type', 'startup'),
        }

    def _default_traits(self, segment: str) -> Dict:
        """Default traits when no synthetic data available"""
        defaults = {
            'power_user': {
                'bio': 'Experienced user who relies on the product daily for work.',
                'status': 'Power user',
                'patience': 0.8, 'tech_level': 0.9, 'price_sensitivity': 0.3,
                'nps_score': 9, 'tenure_months': 12
            },
            'casual': {
                'bio': 'Uses the product occasionally for personal projects.',
                'status': 'Casual user',
                'patience': 0.5, 'tech_level': 0.5, 'price_sensitivity': 0.5,
                'nps_score': 7, 'tenure_months': 6
            },
            'new_user': {
                'bio': 'Just getting started, exploring features.',
                'status': 'New user',
                'patience': 0.7, 'tech_level': 0.4, 'price_sensitivity': 0.6,
                'nps_score': 7, 'tenure_months': 1
            },
            'churned': {
                'bio': 'Former user who left due to unmet needs.',
                'status': 'Churned user',
                'patience': 0.2, 'tech_level': 0.5, 'price_sensitivity': 0.8,
                'nps_score': 3, 'tenure_months': 4
            }
        }
        return defaults.get(segment, defaults['casual'])

    def enrich_agent(self, agent: Dict, segment: str) -> Dict:
        """
        Enrich an agent dict with synthetic traits.
        Merges Zep entity data with realistic behavioral traits.
        """
        traits = self.get_random_traits_for_segment(segment)

        # Merge traits into agent, keeping original data
        enriched = {**agent}
        enriched['bio'] = traits.get('bio', agent.get('bio', ''))
        enriched['status'] = traits.get('status', agent.get('status', ''))
        enriched['patience'] = traits.get('patience', 0.5)
        enriched['tech_level'] = traits.get('tech_level', 0.5)
        enriched['price_sensitivity'] = traits.get('price_sensitivity', 0.5)
        enriched['nps_score'] = traits.get('nps_score', 5)
        enriched['tenure_months'] = traits.get('tenure_months', 1)
        enriched['features_used'] = traits.get('features_used', [])
        enriched['plan'] = traits.get('plan', 'Free')
        enriched['location'] = traits.get('location', 'Unknown')

        # Churned users get churn reason
        if segment == 'churned' and traits.get('churn_reason'):
            enriched['churn_reason'] = traits['churn_reason']

        return enriched


# Singleton instance
_loader_instance = None

def get_data_loader() -> SyntheticDataLoader:
    """Get or create the singleton data loader"""
    global _loader_instance
    if _loader_instance is None:
        _loader_instance = SyntheticDataLoader()
    return _loader_instance


def enrich_agents_with_synthetic_data(agents: List[Dict]) -> List[Dict]:
    """
    Convenience function to enrich a list of agents with synthetic traits.
    Call this after generating agent shells from Zep entities.
    """
    try:
        loader = get_data_loader()
        return [loader.enrich_agent(agent, agent.get('segment', 'casual')) for agent in agents]
    except FileNotFoundError:
        # If synthetic data not available, return agents unchanged
        return agents
