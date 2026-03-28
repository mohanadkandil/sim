"""
Forum Simulator
Simulates agent responses to feature posts using Gemini LLM
"""

import random
import time
import json
from typing import Dict, Any, List, Optional, Generator

from ..config import Config
from ..utils.logger import get_logger
from ..utils.llm_client import LLMClient
from .forum_agent_generator import ForumAgent

logger = get_logger('crucible.forum_simulator')

# Decision prompt template
DECISION_PROMPT = """You are {agent_name}, a {segment} user of a software product.

Your profile:
- You have used the product for {days_active} days with {sessions} sessions
- Your patience level: {patience}
- Your technical level: {tech_level}
- Your interests: {interests}
- Your pain points: {pain_points}
- Past events: {events}

The Product Manager just posted about a new feature:
Title: {post_title}
Content: {post_content}

Based on your profile and experience, decide what action to take:
1. COMMENT - Write a comment expressing your opinion
2. UPVOTE - Silently upvote if you agree
3. DOWNVOTE - Silently downvote if you disagree
4. SILENT - Do nothing, skip this post

Respond with ONLY one of: COMMENT, UPVOTE, DOWNVOTE, SILENT

Your decision:"""

# Content prompt template
CONTENT_PROMPT = """You are {agent_name}, a {segment} user of a software product.

Your profile:
- Patience: {patience}
- Technical level: {tech_level}
- Communication style: {communication_style}
- Your interests: {interests}
- Your pain points: {pain_points}
- Past events: {events}

The PM posted about: {post_title}
"{post_content}"

Write a realistic comment (1-3 sentences) from your perspective as a {segment} user.
Be specific about YOUR experience with the product. Reference your pain points if relevant.

{segment_guidance}

Your comment (1-3 sentences only):"""

# Segment-specific guidance
SEGMENT_GUIDANCE = {
    'power_user': "As a power user, you care deeply about advanced features, performance, and reliability. You have strong opinions based on extensive use.",
    'casual': "As a casual user, you appreciate simplicity and ease of use. You're generally positive but may have concerns about complexity.",
    'new_user': "As a new user, you're still learning the product. You might ask questions or express confusion about how things work.",
    'churned': "As a churned user, you left for a reason. You're likely skeptical and may bring up past issues that drove you away."
}


class ForumSimulator:
    """
    Simulates agent responses to forum posts

    Uses Gemini LLM to generate realistic agent responses based on their profiles.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or LLMClient()

    def simulate_responses(
        self,
        agents: List[ForumAgent],
        post_content: str,
        post_title: str = "",
        min_delay: float = 0.5,
        max_delay: float = 2.0
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Simulate agent responses to a post

        Args:
            agents: List of agents to simulate
            post_content: The post content
            post_title: Optional post title
            min_delay: Minimum delay between responses
            max_delay: Maximum delay between responses

        Yields:
            Dict with agent response data
        """
        # Shuffle agents for random order
        agents_shuffled = list(agents)
        random.shuffle(agents_shuffled)

        logger.info(f"Simulating responses from {len(agents_shuffled)} agents")

        for i, agent in enumerate(agents_shuffled):
            try:
                # Decide action
                action = self._decide_action(agent, post_content, post_title)

                # Generate response
                response = self._generate_response(
                    agent=agent,
                    action=action,
                    post_content=post_content,
                    post_title=post_title
                )

                # Add delay for realism (except for last agent)
                if i < len(agents_shuffled) - 1:
                    delay = random.uniform(min_delay, max_delay)
                    time.sleep(delay)

                yield response

            except Exception as e:
                logger.error(f"Error simulating agent {agent.id}: {e}")
                # Yield silent action on error
                yield {
                    'agent_id': agent.id,
                    'agent_name': agent.name,
                    'agent_segment': agent.segment,
                    'entity_id': agent.entity_id,
                    'action': 'silent',
                    'error': str(e)
                }

    def _decide_action(
        self,
        agent: ForumAgent,
        post_content: str,
        post_title: str
    ) -> str:
        """
        Decide what action the agent should take

        Uses LLM to determine if agent should comment, vote, or stay silent.
        Falls back to rule-based logic if LLM fails.
        """
        try:
            prompt = DECISION_PROMPT.format(
                agent_name=agent.name,
                segment=agent.segment,
                days_active=agent.days_active,
                sessions=agent.sessions,
                patience=agent.patience,
                tech_level=agent.tech_level,
                interests=', '.join(agent.interests),
                pain_points=', '.join(agent.pain_points),
                events=', '.join(agent.events),
                post_title=post_title,
                post_content=post_content
            )

            response = self.llm_client.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=20
            )

            decision = response.strip().upper()

            # Parse decision
            if 'COMMENT' in decision:
                return 'comment'
            elif 'UPVOTE' in decision:
                return 'upvote'
            elif 'DOWNVOTE' in decision:
                return 'downvote'
            else:
                return 'silent'

        except Exception as e:
            logger.warning(f"LLM decision failed for {agent.id}: {e}")
            # Fall back to rule-based logic
            return self._rule_based_decision(agent)

    def _rule_based_decision(self, agent: ForumAgent) -> str:
        """
        Rule-based fallback for action decision
        """
        # Higher engagement for power users and churned users
        if agent.segment == 'power_user':
            weights = {'comment': 0.5, 'upvote': 0.3, 'downvote': 0.1, 'silent': 0.1}
        elif agent.segment == 'churned':
            weights = {'comment': 0.4, 'upvote': 0.1, 'downvote': 0.3, 'silent': 0.2}
        elif agent.segment == 'new_user':
            weights = {'comment': 0.3, 'upvote': 0.4, 'downvote': 0.1, 'silent': 0.2}
        else:  # casual
            weights = {'comment': 0.3, 'upvote': 0.3, 'downvote': 0.1, 'silent': 0.3}

        actions = list(weights.keys())
        probs = list(weights.values())

        return random.choices(actions, weights=probs)[0]

    def _generate_response(
        self,
        agent: ForumAgent,
        action: str,
        post_content: str,
        post_title: str
    ) -> Dict[str, Any]:
        """
        Generate the full response data
        """
        response = {
            'agent_id': agent.id,
            'agent_name': agent.name,
            'agent_segment': agent.segment,
            'agent_avatar': agent.avatar,
            'entity_id': agent.entity_id,
            'action': action
        }

        if action == 'comment':
            # Generate comment content
            content, sentiment = self._generate_comment(
                agent=agent,
                post_content=post_content,
                post_title=post_title
            )
            response['content'] = content
            response['sentiment'] = sentiment

        elif action in ['upvote', 'downvote']:
            response['sentiment'] = 'positive' if action == 'upvote' else 'negative'

        else:  # silent
            response['sentiment'] = 'neutral'

        return response

    def _generate_comment(
        self,
        agent: ForumAgent,
        post_content: str,
        post_title: str
    ) -> tuple[str, str]:
        """
        Generate comment content using LLM

        Returns:
            Tuple of (content, sentiment)
        """
        try:
            guidance = SEGMENT_GUIDANCE.get(agent.segment, SEGMENT_GUIDANCE['casual'])

            prompt = CONTENT_PROMPT.format(
                agent_name=agent.name,
                segment=agent.segment,
                patience=agent.patience,
                tech_level=agent.tech_level,
                communication_style=agent.communication_style,
                interests=', '.join(agent.interests),
                pain_points=', '.join(agent.pain_points),
                events=', '.join(agent.events),
                post_title=post_title,
                post_content=post_content,
                segment_guidance=guidance
            )

            content = self.llm_client.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.8,
                max_tokens=150
            )

            # Clean up content
            content = content.strip()
            content = content.strip('"\'')

            # Determine sentiment from content
            sentiment = self._analyze_sentiment(content, agent.segment)

            # Update agent memory
            agent.memory.append(content[:100])
            if len(agent.memory) > 5:
                agent.memory = agent.memory[-5:]

            return content, sentiment

        except Exception as e:
            logger.warning(f"LLM comment generation failed for {agent.id}: {e}")
            # Fall back to template-based comment
            return self._template_comment(agent), self._default_sentiment(agent.segment)

    def _template_comment(self, agent: ForumAgent) -> str:
        """
        Generate a template-based comment as fallback
        """
        templates = {
            'power_user': [
                f"As someone who uses this daily, {random.choice(agent.pain_points)} is still a major issue.",
                f"I've been using this for {agent.days_active} days. Would love to see improvements in {random.choice(agent.interests)}.",
                f"This could work, but please prioritize {random.choice(agent.pain_points)} first."
            ],
            'casual': [
                "Sounds interesting! Hope it's easy to use.",
                f"I mainly care about {random.choice(agent.interests)}. Will this help with that?",
                "Nice update! Looking forward to trying it."
            ],
            'new_user': [
                "I'm new here - can someone explain how this would work?",
                f"Still learning the product. Is this related to {random.choice(agent.interests)}?",
                "Sounds cool! Will there be a tutorial?"
            ],
            'churned': [
                f"I left because of {random.choice(agent.pain_points)}. Is this finally being fixed?",
                f"Would consider coming back if you actually addressed {random.choice(agent.pain_points)}.",
                f"Too little, too late. Should have focused on {random.choice(agent.pain_points)} earlier."
            ]
        }

        segment_templates = templates.get(agent.segment, templates['casual'])
        return random.choice(segment_templates)

    def _analyze_sentiment(self, content: str, segment: str) -> str:
        """
        Analyze sentiment of generated content
        """
        content_lower = content.lower()

        negative_words = ['issue', 'problem', 'fail', 'broken', 'left', 'hate', 'worst', 'terrible', 'fix', 'bug']
        positive_words = ['love', 'great', 'awesome', 'excited', 'helpful', 'nice', 'good', 'thanks', 'amazing']

        negative_count = sum(1 for word in negative_words if word in content_lower)
        positive_count = sum(1 for word in positive_words if word in content_lower)

        # Adjust based on segment tendency
        if segment == 'churned':
            negative_count += 1
        elif segment == 'new_user':
            positive_count += 1

        if negative_count > positive_count:
            return 'negative'
        elif positive_count > negative_count:
            return 'positive'
        else:
            return 'neutral'

    def _default_sentiment(self, segment: str) -> str:
        """
        Get default sentiment based on segment
        """
        if segment == 'churned':
            return 'negative'
        elif segment == 'power_user':
            return random.choice(['positive', 'neutral', 'negative'])
        elif segment == 'new_user':
            return random.choice(['positive', 'neutral'])
        else:
            return 'neutral'
