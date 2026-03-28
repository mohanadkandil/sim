"""
Forum Agent Generator
Generates forum agents from Zep graph entities
"""

import random
import uuid
import hashlib
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict

from ..config import Config
from ..utils.logger import get_logger
from ..utils.llm_client import LLMClient
from .zep_entity_reader import ZepEntityReader

logger = get_logger('crucible.forum_agent_generator')

# Segment colors for visualization
SEGMENT_COLORS = {
    'power_user': '#8B5CF6',  # Violet
    'casual': '#22C55E',       # Green
    'new_user': '#FBBF24',     # Amber
    'churned': '#F97316'       # Orange
}

# Names pool for generating synthetic agents
FIRST_NAMES = [
    "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Avery",
    "Parker", "Blake", "Cameron", "Drew", "Emery", "Finley", "Harper", "Jamie",
    "Kendall", "Logan", "Mackenzie", "Nico", "Oakley", "Peyton", "Reese", "Sage",
    "Sam", "Skyler", "Sydney", "Tatum", "Val", "Winter", "Yuki", "Zion",
    "Adrian", "Beau", "Charlie", "Devon", "Eden", "Frankie", "Grey", "Hayden",
    "Indigo", "Jesse", "Kai", "Lee", "Marley", "Nat", "Ocean", "Phoenix",
    "River", "Shay", "Terry", "Uri", "Venice", "Wren", "Xen", "Yael", "Zen"
]

LAST_NAMES = [
    "Chen", "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson",
    "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez",
    "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis",
    "Kim", "Patel", "Singh", "Wang", "Li", "Zhang", "Liu", "Yang", "Huang",
    "Nakamura", "Tanaka", "Watanabe", "Yamamoto", "Sato", "Suzuki", "Mueller",
    "Schmidt", "Weber", "Rossi", "Bianchi", "Costa", "Santos", "Oliveira"
]


@dataclass
class ForumAgent:
    """Forum agent profile"""
    id: str
    name: str
    avatar: str
    segment: str
    segment_color: str

    # From graph entity
    entity_id: Optional[str] = None
    entity_type: str = "Person"
    entity_summary: str = ""
    related_entities: List[str] = field(default_factory=list)

    # Behavioral traits
    patience: str = "medium"  # low | medium | high
    tech_level: str = "intermediate"  # beginner | intermediate | advanced
    price_sensitivity: str = "medium"  # low | medium | high
    communication_style: str = "balanced"  # brief | detailed | emotional

    # Forum-specific
    sessions: int = 0
    days_active: int = 0
    interests: List[str] = field(default_factory=list)
    pain_points: List[str] = field(default_factory=list)
    events: List[str] = field(default_factory=list)
    memory: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


class ForumAgentGenerator:
    """
    Generates forum agents from Zep graph entities

    Uses existing ZepEntityReader to get entities, then enhances them
    with forum-specific traits using LLM.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or LLMClient()
        self.zep_reader = ZepEntityReader()

    def generate_agents(
        self,
        graph_id: str,
        count: int = 200,
        segments: Optional[Dict[str, float]] = None,
        use_llm: bool = True
    ) -> List[ForumAgent]:
        """
        Generate forum agents from graph entities

        Args:
            graph_id: Zep graph ID
            count: Number of agents to generate
            segments: Distribution of segments (defaults to balanced)
            use_llm: Whether to use LLM for trait generation

        Returns:
            List of ForumAgent objects
        """
        segments = segments or {
            'power_user': 0.35,
            'casual': 0.30,
            'new_user': 0.25,
            'churned': 0.10
        }

        logger.info(f"Generating {count} agents from graph {graph_id}")

        # Try to get entities from Zep graph
        entities = []
        try:
            filtered = self.zep_reader.filter_defined_entities(
                graph_id=graph_id,
                enrich_with_edges=True
            )
            entities = filtered.entities
            logger.info(f"Found {len(entities)} entities in graph")
        except Exception as e:
            logger.warning(f"Could not read graph entities: {e}")
            logger.info("Generating synthetic agents instead")

        # Generate agents
        agents = []

        if entities:
            # Generate agents based on entities
            agents = self._generate_from_entities(entities, count, segments, use_llm)
        else:
            # Generate fully synthetic agents
            agents = self._generate_synthetic(count, segments)

        logger.info(f"Generated {len(agents)} agents")
        return agents

    def _generate_from_entities(
        self,
        entities: List[Dict[str, Any]],
        count: int,
        segments: Dict[str, float],
        use_llm: bool
    ) -> List[ForumAgent]:
        """Generate agents based on graph entities"""
        agents = []

        # Calculate segment counts
        segment_counts = {
            seg: int(count * pct)
            for seg, pct in segments.items()
        }

        # Ensure we hit exact count
        total = sum(segment_counts.values())
        if total < count:
            segment_counts['casual'] += count - total

        # Distribute entities across segments
        entity_pool = list(entities)
        random.shuffle(entity_pool)

        for segment, seg_count in segment_counts.items():
            for i in range(seg_count):
                # Use entity if available, otherwise create synthetic
                entity = None
                if entity_pool:
                    entity = entity_pool.pop(0)

                agent = self._create_agent(
                    segment=segment,
                    entity=entity,
                    use_llm=use_llm
                )
                agents.append(agent)

                # Recycle entities if we run out
                if not entity_pool and entities:
                    entity_pool = list(entities)
                    random.shuffle(entity_pool)

        return agents

    def _generate_synthetic(
        self,
        count: int,
        segments: Dict[str, float]
    ) -> List[ForumAgent]:
        """Generate fully synthetic agents without graph data"""
        agents = []

        # Calculate segment counts
        segment_counts = {
            seg: int(count * pct)
            for seg, pct in segments.items()
        }

        total = sum(segment_counts.values())
        if total < count:
            segment_counts['casual'] += count - total

        for segment, seg_count in segment_counts.items():
            for i in range(seg_count):
                agent = self._create_agent(
                    segment=segment,
                    entity=None,
                    use_llm=False
                )
                agents.append(agent)

        return agents

    def _create_agent(
        self,
        segment: str,
        entity: Optional[Dict[str, Any]] = None,
        use_llm: bool = False
    ) -> ForumAgent:
        """Create a single agent"""
        agent_id = f"agent_{uuid.uuid4().hex[:8]}"

        # Generate name
        if entity and entity.get('name'):
            name = entity['name']
        else:
            first = random.choice(FIRST_NAMES)
            last = random.choice(LAST_NAMES)
            name = f"{first} {last}"

        # Generate avatar (hash-based for consistency)
        avatar = self._generate_avatar(name)

        # Get segment traits
        traits = self._get_segment_traits(segment)

        # Entity data
        entity_id = entity.get('uuid') if entity else None
        entity_type = entity.get('entity_type', 'Person') if entity else 'Person'
        entity_summary = entity.get('summary', '') if entity else ''

        # Get related entities
        related_entities = []
        if entity and entity.get('edges'):
            related_entities = [
                edge.get('target_name', edge.get('target_uuid', ''))
                for edge in entity.get('edges', [])[:5]
            ]

        # Generate interests and pain points based on segment
        interests = self._generate_interests(segment, entity)
        pain_points = self._generate_pain_points(segment, entity)
        events = self._generate_events(segment)

        return ForumAgent(
            id=agent_id,
            name=name,
            avatar=avatar,
            segment=segment,
            segment_color=SEGMENT_COLORS.get(segment, '#8B5CF6'),
            entity_id=entity_id,
            entity_type=entity_type,
            entity_summary=entity_summary,
            related_entities=related_entities,
            patience=traits['patience'],
            tech_level=traits['tech_level'],
            price_sensitivity=traits['price_sensitivity'],
            communication_style=traits['communication_style'],
            sessions=traits['sessions'],
            days_active=traits['days_active'],
            interests=interests,
            pain_points=pain_points,
            events=events,
            memory=[]
        )

    def _generate_avatar(self, name: str) -> str:
        """Generate avatar URL based on name hash"""
        name_hash = hashlib.md5(name.encode()).hexdigest()
        # Use DiceBear for avatar generation
        return f"https://api.dicebear.com/7.x/avataaars/svg?seed={name_hash}"

    def _get_segment_traits(self, segment: str) -> Dict[str, Any]:
        """Get typical traits for a segment"""
        traits = {
            'power_user': {
                'patience': random.choice(['low', 'medium']),
                'tech_level': random.choice(['intermediate', 'advanced']),
                'price_sensitivity': 'low',
                'communication_style': random.choice(['detailed', 'brief']),
                'sessions': random.randint(30, 100),
                'days_active': random.randint(90, 365)
            },
            'casual': {
                'patience': 'medium',
                'tech_level': random.choice(['beginner', 'intermediate']),
                'price_sensitivity': 'medium',
                'communication_style': 'balanced',
                'sessions': random.randint(5, 30),
                'days_active': random.randint(30, 120)
            },
            'new_user': {
                'patience': 'high',
                'tech_level': 'beginner',
                'price_sensitivity': random.choice(['medium', 'high']),
                'communication_style': random.choice(['balanced', 'emotional']),
                'sessions': random.randint(1, 10),
                'days_active': random.randint(1, 14)
            },
            'churned': {
                'patience': 'low',
                'tech_level': random.choice(['beginner', 'intermediate', 'advanced']),
                'price_sensitivity': 'high',
                'communication_style': random.choice(['brief', 'emotional']),
                'sessions': random.randint(2, 15),
                'days_active': random.randint(7, 60)
            }
        }
        return traits.get(segment, traits['casual'])

    def _generate_interests(
        self,
        segment: str,
        entity: Optional[Dict[str, Any]] = None
    ) -> List[str]:
        """Generate interests based on segment and entity"""
        base_interests = {
            'power_user': ['automation', 'api', 'integrations', 'advanced features', 'performance'],
            'casual': ['ease of use', 'basic features', 'documentation', 'tutorials'],
            'new_user': ['getting started', 'onboarding', 'simple workflows', 'help'],
            'churned': ['reliability', 'support', 'pricing', 'alternatives']
        }

        interests = base_interests.get(segment, base_interests['casual'])[:3]

        # Add entity-specific interests
        if entity:
            summary = entity.get('summary', '')
            if 'export' in summary.lower():
                interests.append('export features')
            if 'report' in summary.lower():
                interests.append('reporting')
            if 'data' in summary.lower():
                interests.append('data management')

        return interests[:5]

    def _generate_pain_points(
        self,
        segment: str,
        entity: Optional[Dict[str, Any]] = None
    ) -> List[str]:
        """Generate pain points based on segment"""
        pain_points = {
            'power_user': ['slow performance', 'missing advanced features', 'api limitations'],
            'casual': ['confusing ui', 'too many options', 'steep learning curve'],
            'new_user': ['unclear onboarding', 'lack of guidance', 'overwhelming interface'],
            'churned': ['reliability issues', 'poor support', 'high pricing', 'broken features']
        }

        points = pain_points.get(segment, pain_points['casual'])[:2]

        # Add entity-specific pain points
        if entity:
            summary = entity.get('summary', '')
            if 'export' in summary.lower() and segment == 'churned':
                points.append('export failures')
            if 'error' in summary.lower():
                points.append('frequent errors')

        return points[:4]

    def _generate_events(self, segment: str) -> List[str]:
        """Generate event history based on segment"""
        events = {
            'power_user': [
                'feature_power_use', 'api_access', 'bulk_export', 'advanced_settings',
                'integration_setup', 'automation_created'
            ],
            'casual': [
                'feature_basic_use', 'help_viewed', 'tutorial_completed',
                'settings_changed', 'profile_updated'
            ],
            'new_user': [
                'signup', 'onboarding_started', 'first_feature_use',
                'help_clicked', 'tutorial_started'
            ],
            'churned': [
                'export_failed', 'error_encountered', 'support_contacted',
                'subscription_cancelled', 'account_inactive'
            ]
        }

        segment_events = events.get(segment, events['casual'])
        return random.sample(segment_events, min(3, len(segment_events)))
