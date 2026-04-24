"""
Forum API Blueprint
Handles dynamic agent generation from graph and forum simulation
"""

import json
import random
import time
import uuid
import threading
from typing import Dict, Any, List, Optional, Generator
from flask import Blueprint, request, jsonify, Response, stream_with_context
from dataclasses import dataclass, field, asdict

from ..config import Config
from ..utils.logger import get_logger
from ..utils.llm_client import LLMClient
from ..services.forum_agent_generator import ForumAgentGenerator, ForumAgent
from ..services.forum_simulator import ForumSimulator

logger = get_logger('crucible.forum')

forum_bp = Blueprint('forum', __name__, url_prefix='/api/forum')

# In-memory storage for topics and posts (would use DB in production)
_topics: Dict[str, Dict[str, Any]] = {}
_posts: Dict[str, Dict[str, Any]] = {}
_agents: Dict[str, List[ForumAgent]] = {}  # graph_id -> agents

# Background simulation jobs
_simulation_jobs: Dict[str, Dict[str, Any]] = {}  # topic_id -> job state
_simulation_threads: Dict[str, threading.Thread] = {}  # topic_id -> thread


@forum_bp.route('/generate-agents', methods=['POST'])
def generate_agents():
    """
    Generate agents from graph entities

    Request:
        {
            "graph_id": "crucible_abc123",
            "count": 200,
            "active_count": 75,
            "segments": {
                "power_user": 0.35,
                "casual": 0.30,
                "new_user": 0.25,
                "churned": 0.10
            }
        }

    Response:
        {
            "success": true,
            "agents": [...]
        }
    """
    try:
        data = request.get_json()
        graph_id = data.get('graph_id')
        count = data.get('count', 200)
        active_count = data.get('active_count', 75)
        segments = data.get('segments', {
            'power_user': 0.35,
            'casual': 0.30,
            'new_user': 0.25,
            'churned': 0.10
        })

        if not graph_id:
            return jsonify({'success': False, 'error': 'graph_id is required'}), 400

        logger.info(f"Generating {count} agents for graph {graph_id}")

        # Generate agents
        generator = ForumAgentGenerator()
        agents = generator.generate_agents(
            graph_id=graph_id,
            count=count,
            segments=segments
        )

        # Store agents for later use
        _agents[graph_id] = agents

        # Convert to dict for JSON response
        agents_data = [agent.to_dict() for agent in agents]

        logger.info(f"Generated {len(agents)} agents for graph {graph_id}")

        return jsonify({
            'success': True,
            'agents': agents_data,
            'total_count': len(agents),
            'active_count': active_count,
            'segments': segments
        })

    except Exception as e:
        logger.error(f"Error generating agents: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@forum_bp.route('/create-topic', methods=['POST'])
def create_topic():
    """
    Create a new topic/subreddit for a feature

    Request:
        {
            "name": "AI Autocomplete Feature",
            "description": "Discussion about the new AI autocomplete feature",
            "graph_id": "crucible_abc123"
        }

    Response:
        {
            "success": true,
            "topic": {...}
        }
    """
    try:
        data = request.get_json()
        name = data.get('name')
        description = data.get('description', '')
        graph_id = data.get('graph_id')

        if not name:
            return jsonify({'success': False, 'error': 'name is required'}), 400

        topic_id = f"topic_{uuid.uuid4().hex[:8]}"

        # Create subreddit-style name
        subreddit_name = 'r/' + name.replace(' ', '').replace('-', '')[:20]

        topic = {
            'id': topic_id,
            'name': name,
            'subreddit': subreddit_name,
            'description': description,
            'graph_id': graph_id,
            'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'post_count': 0,
            'comment_count': 0,
            'member_count': len(_agents.get(graph_id, []))
        }

        _topics[topic_id] = topic

        logger.info(f"Created topic: {topic_id} - {subreddit_name}")

        return jsonify({
            'success': True,
            'topic': topic
        })

    except Exception as e:
        logger.error(f"Error creating topic: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@forum_bp.route('/post', methods=['POST'])
def create_post():
    """
    Create a new post in a topic

    Request:
        {
            "topic_id": "topic_abc123",
            "content": "We're thinking of adding AI autocomplete...",
            "title": "New Feature: AI Autocomplete",
            "author": "PM"
        }

    Response:
        {
            "success": true,
            "post": {...}
        }
    """
    try:
        data = request.get_json()
        topic_id = data.get('topic_id')
        content = data.get('content')
        title = data.get('title', '')
        author = data.get('author', 'PM')

        if not topic_id or not content:
            return jsonify({'success': False, 'error': 'topic_id and content are required'}), 400

        if topic_id not in _topics:
            return jsonify({'success': False, 'error': 'Topic not found'}), 404

        post_id = f"post_{uuid.uuid4().hex[:8]}"

        post = {
            'id': post_id,
            'topic_id': topic_id,
            'title': title,
            'content': content,
            'author': author,
            'author_type': 'pm',
            'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'upvotes': 1,
            'downvotes': 0,
            'comments': []
        }

        _posts[post_id] = post
        _topics[topic_id]['post_count'] += 1

        logger.info(f"Created post: {post_id} in topic {topic_id}")

        return jsonify({
            'success': True,
            'post': post
        })

    except Exception as e:
        logger.error(f"Error creating post: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@forum_bp.route('/simulate-response', methods=['GET'])
def simulate_response_sse():
    """
    Simulate agent responses using Server-Sent Events (SSE)

    Query params:
        topic_id: Topic ID
        post_id: Post ID
        active_count: Number of agents to respond (default 75)

    SSE Response:
        data: {"agent_id": "...", "action": "comment", "content": "...", "sentiment": "positive"}
    """
    topic_id = request.args.get('topic_id')
    post_id = request.args.get('post_id')
    active_count = int(request.args.get('active_count', 75))

    if not topic_id or not post_id:
        return jsonify({'success': False, 'error': 'topic_id and post_id are required'}), 400

    if topic_id not in _topics:
        return jsonify({'success': False, 'error': 'Topic not found'}), 404

    if post_id not in _posts:
        return jsonify({'success': False, 'error': 'Post not found'}), 404

    topic = _topics[topic_id]
    post = _posts[post_id]
    graph_id = topic.get('graph_id')

    # Get agents for this graph
    agents = _agents.get(graph_id, [])
    if not agents:
        return jsonify({'success': False, 'error': 'No agents found for this graph'}), 404

    def generate_responses():
        """Generator for SSE responses"""
        simulator = ForumSimulator()

        # Get active subset of agents
        active_agents = random.sample(agents, min(active_count, len(agents)))

        logger.info(f"Simulating {len(active_agents)} agent responses for post {post_id}")

        stats = {
            'comments': 0,
            'upvotes': 0,
            'downvotes': 0,
            'silent': 0
        }

        for response in simulator.simulate_responses(
            agents=active_agents,
            post_content=post['content'],
            post_title=post.get('title', '')
        ):
            # Track stats
            action = response.get('action', 'silent')
            if action == 'comment':
                stats['comments'] += 1
                # Store comment in post
                comment = {
                    'id': f"comment_{uuid.uuid4().hex[:8]}",
                    'agent_id': response['agent_id'],
                    'agent_name': response['agent_name'],
                    'agent_segment': response['agent_segment'],
                    'content': response.get('content', ''),
                    'sentiment': response.get('sentiment', 'neutral'),
                    'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'upvotes': random.randint(0, 10),
                    'downvotes': random.randint(0, 3)
                }
                _posts[post_id]['comments'].append(comment)
                _topics[topic_id]['comment_count'] += 1
            elif action == 'upvote':
                stats['upvotes'] += 1
                _posts[post_id]['upvotes'] += 1
            elif action == 'downvote':
                stats['downvotes'] += 1
                _posts[post_id]['downvotes'] += 1
            else:
                stats['silent'] += 1

            # Yield SSE event
            yield f"data: {json.dumps(response)}\n\n"

        # Send completion event
        completion = {
            'type': 'complete',
            'stats': stats,
            'adoption_score': calculate_adoption_score(stats)
        }
        yield f"data: {json.dumps(completion)}\n\n"

        logger.info(f"Simulation complete: {stats}")

    return Response(
        stream_with_context(generate_responses()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        }
    )


@forum_bp.route('/topics/<topic_id>/activity', methods=['GET'])
def get_topic_activity(topic_id: str):
    """
    Get all posts and comments for a topic
    """
    if topic_id not in _topics:
        return jsonify({'success': False, 'error': 'Topic not found'}), 404

    topic = _topics[topic_id]

    # Get all posts for this topic
    posts = [p for p in _posts.values() if p['topic_id'] == topic_id]

    return jsonify({
        'success': True,
        'topic': topic,
        'posts': posts
    })


@forum_bp.route('/topics', methods=['GET'])
def list_topics():
    """
    List all topics
    """
    graph_id = request.args.get('graph_id')

    topics = list(_topics.values())

    if graph_id:
        topics = [t for t in topics if t.get('graph_id') == graph_id]

    return jsonify({
        'success': True,
        'topics': topics
    })


@forum_bp.route('/agents/<graph_id>', methods=['GET'])
def get_agents(graph_id: str):
    """
    Get agents for a graph
    """
    agents = _agents.get(graph_id, [])

    return jsonify({
        'success': True,
        'agents': [agent.to_dict() for agent in agents],
        'count': len(agents)
    })


@forum_bp.route('/create-topic-with-post', methods=['POST'])
def create_topic_with_post():
    """
    Create a topic and first post in one call.
    Uses LLM to generate a summary/title for the topic.

    Request:
        {
            "feature_text": "Feature description...",
            "graph_id": "crucible_abc123",
            "agents": [...] (optional)
        }

    Response:
        {
            "success": true,
            "topic": {...},
            "post": {...},
            "summary": "..."
        }
    """
    try:
        data = request.get_json()
        feature_text = data.get('feature_text', '')
        graph_id = data.get('graph_id')
        agents_data = data.get('agents', [])

        if not feature_text:
            return jsonify({'success': False, 'error': 'feature_text is required'}), 400

        # Use LLM to generate a title and summary
        llm = LLMClient()
        summary_prompt = f"""You are a product manager. Given this feature description, create a concise title and summary.

Feature description: "{feature_text}"

Respond in this exact JSON format:
{{"title": "Short catchy title (5-8 words)", "summary": "One sentence summary of the feature"}}"""

        try:
            summary_response = llm.generate(summary_prompt, max_tokens=150)
            import re
            json_match = re.search(r'\{[^}]+\}', summary_response)
            if json_match:
                summary_data = json.loads(json_match.group())
                title = summary_data.get('title', 'New Feature Proposal')
                summary = summary_data.get('summary', feature_text[:100])
            else:
                title = 'New Feature Proposal'
                summary = feature_text[:100]
        except Exception as e:
            logger.warning(f"LLM summary failed: {e}")
            title = 'New Feature Proposal'
            summary = feature_text[:100]

        # Create topic
        topic_id = f"topic_{uuid.uuid4().hex[:8]}"
        subreddit_name = 'r/' + ''.join(c for c in title if c.isalnum())[:20]

        topic = {
            'id': topic_id,
            'name': title,
            'subreddit': subreddit_name,
            'description': summary,
            'graph_id': graph_id,
            'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'post_count': 1,
            'comment_count': 0,
            'member_count': len(agents_data)
        }
        _topics[topic_id] = topic

        # Create first post
        post_id = f"post_{uuid.uuid4().hex[:8]}"
        post = {
            'id': post_id,
            'topic_id': topic_id,
            'title': title,
            'content': feature_text,
            'author': 'Product Manager',
            'author_type': 'pm',
            'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'upvotes': 1,
            'downvotes': 0,
            'comments': []
        }
        _posts[post_id] = post

        # Store agents if provided
        if agents_data and graph_id:
            # Convert dict agents to ForumAgent objects for storage
            from ..services.forum_agent_generator import ForumAgent
            agents_list = []
            for agent_dict in agents_data:
                agent = ForumAgent(
                    id=agent_dict.get('id', f"agent_{uuid.uuid4().hex[:8]}"),
                    name=agent_dict.get('name', 'Unknown'),
                    avatar=agent_dict.get('avatar', ''),
                    segment=agent_dict.get('segment', 'casual'),
                    segment_color=agent_dict.get('segment_color', '#8E8E93'),
                    entity_id=agent_dict.get('entity_id'),
                    entity_type=agent_dict.get('entity_type', 'Person'),
                    entity_summary=agent_dict.get('entity_summary', ''),
                    patience=agent_dict.get('patience', 'medium'),
                    tech_level=agent_dict.get('tech_level', 'intermediate'),
                    price_sensitivity=agent_dict.get('price_sensitivity', 'medium'),
                    communication_style=agent_dict.get('communication_style', 'balanced')
                )
                agents_list.append(agent)
            _agents[graph_id] = agents_list
            topic['member_count'] = len(agents_list)

        logger.info(f"Created topic {topic_id} with post {post_id}: {title}")

        # AUTO-START BACKGROUND SIMULATION if agents are provided
        if agents_data and len(agents_data) > 0:
            # Convert ForumAgent objects to dicts if needed
            agents_dicts = []
            for a in agents_data:
                if isinstance(a, dict):
                    agents_dicts.append(a)
                elif hasattr(a, 'to_dict'):
                    agents_dicts.append(a.to_dict())
                elif hasattr(a, '__dict__'):
                    agents_dicts.append(vars(a))

            # Start background simulation
            start_background_simulation(
                topic_id=topic_id,
                post_id=post_id,
                post_content=feature_text,
                post_title=title,
                agents_data=agents_dicts,
                rounds=40
            )
            logger.info(f"Auto-started background simulation for topic {topic_id}")

        return jsonify({
            'success': True,
            'topic': topic,
            'post': post,
            'summary': summary,
            'simulation_started': len(agents_data) > 0
        })

    except Exception as e:
        logger.error(f"Error creating topic with post: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@forum_bp.route('/stream-interaction', methods=['POST'])
def stream_interaction():
    """
    Stream agent interactions: initial comments + replies to each other.
    This creates a realistic forum discussion with agent-to-agent replies.

    Request (JSON):
        {
            "topic_id": "topic_abc",
            "post_id": "post_123",
            "agents": [...],
            "max_comments": 30,
            "max_replies_per_comment": 3
        }

    SSE Events:
        - comment: Initial comment on the post
        - reply: Reply to another agent's comment
        - complete: All interactions done
    """
    data = request.get_json() or {}
    topic_id = data.get('topic_id')
    post_id = data.get('post_id')
    agents_data = data.get('agents', [])
    max_comments = data.get('max_comments', 30)
    max_replies_per_comment = data.get('max_replies_per_comment', 3)

    if not topic_id or not post_id:
        return jsonify({'success': False, 'error': 'topic_id and post_id required'}), 400

    if not agents_data:
        return jsonify({'success': False, 'error': 'agents required'}), 400

    def generate():
        try:
            llm = LLMClient()
            all_comments = []  # Track all comments for replies
            stats = {'comments': 0, 'replies': 0, 'upvotes': 0, 'downvotes': 0}

            # Shuffle and select agents for initial comments
            shuffled = list(agents_data)
            random.shuffle(shuffled)
            commenting_agents = shuffled[:max_comments]

            yield f"data: {json.dumps({'type': 'status', 'message': f'Starting discussion with {len(commenting_agents)} agents...'})}\n\n"

            # Phase 1: Generate initial comments
            for i, agent in enumerate(commenting_agents):
                try:
                    # Generate comment using agent's traits
                    comment = _generate_agent_comment(llm, agent, data.get('post_content', ''))

                    comment_data = {
                        'type': 'comment',
                        'id': f"comment_{uuid.uuid4().hex[:8]}",
                        'agent_id': agent.get('id'),
                        'agent_name': agent.get('name'),
                        'segment': agent.get('segment'),
                        'color': agent.get('segment_color', '#8B5CF6'),
                        'bio': agent.get('bio', ''),
                        'status': agent.get('status', ''),
                        'content': comment['content'],
                        'sentiment': comment['sentiment'],
                        'parent_id': None,  # Top-level comment
                        'index': i + 1,
                        'total': len(commenting_agents)
                    }

                    all_comments.append(comment_data)
                    stats['comments'] += 1

                    yield f"data: {json.dumps(comment_data)}\n\n"

                    # Small delay
                    time.sleep(random.uniform(0.3, 0.8))

                except Exception as e:
                    logger.warning(f"Comment generation error: {e}")
                    continue

            # Phase 2: Generate replies to comments
            yield f"data: {json.dumps({'type': 'status', 'message': 'Agents are replying to each other...'})}\n\n"

            # Select some comments to receive replies
            reply_candidates = [c for c in all_comments if c['sentiment'] in ['negative', 'positive']]
            reply_candidates = random.sample(reply_candidates, min(len(reply_candidates), max_comments // 2))

            for target_comment in reply_candidates:
                # Find agents who might reply (different segment or opposing sentiment)
                potential_repliers = [
                    a for a in agents_data
                    if a.get('id') != target_comment['agent_id']
                    and a.get('id') not in [c['agent_id'] for c in all_comments]  # Haven't commented yet
                ]

                if not potential_repliers:
                    # Use any agent that hasn't replied to this comment
                    potential_repliers = [a for a in shuffled if a.get('id') != target_comment['agent_id']]

                num_replies = random.randint(1, max_replies_per_comment)
                repliers = random.sample(potential_repliers, min(num_replies, len(potential_repliers)))

                for replier in repliers:
                    try:
                        reply = _generate_agent_reply(llm, replier, target_comment)

                        reply_data = {
                            'type': 'reply',
                            'id': f"reply_{uuid.uuid4().hex[:8]}",
                            'agent_id': replier.get('id'),
                            'agent_name': replier.get('name'),
                            'segment': replier.get('segment'),
                            'color': replier.get('segment_color', '#8B5CF6'),
                            'bio': replier.get('bio', ''),
                            'content': reply['content'],
                            'sentiment': reply['sentiment'],
                            'parent_id': target_comment['id'],
                            'parent_author': target_comment['agent_name'],
                            'parent_content': target_comment['content'][:50] + '...'
                        }

                        stats['replies'] += 1

                        yield f"data: {json.dumps(reply_data)}\n\n"

                        time.sleep(random.uniform(0.4, 1.0))

                    except Exception as e:
                        logger.warning(f"Reply generation error: {e}")
                        continue

            # Phase 3: Some agents vote
            yield f"data: {json.dumps({'type': 'status', 'message': 'Agents voting...'})}\n\n"

            voters = random.sample(agents_data, min(20, len(agents_data)))
            for voter in voters:
                action = random.choice(['upvote', 'upvote', 'upvote', 'downvote'])  # 3:1 upvote bias
                if action == 'upvote':
                    stats['upvotes'] += 1
                else:
                    stats['downvotes'] += 1

            # Complete
            yield f"data: {json.dumps({'type': 'complete', 'stats': stats})}\n\n"

        except Exception as e:
            logger.error(f"Stream interaction error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*'
        }
    )


def _generate_agent_comment(llm: LLMClient, agent: Dict, post_content: str) -> Dict:
    """Generate a comment from an agent based on their persona (enriched with synthetic data)"""
    segment = agent.get('segment', 'casual')
    bio = agent.get('bio', '')
    status = agent.get('status', '')

    # Rich traits from synthetic data
    traits = agent.get('traits', {})
    patience = traits.get('patience', agent.get('patience', 0.5))
    tech_level = traits.get('tech_level', agent.get('tech_level', 0.5))
    price_sensitivity = traits.get('price_sensitivity', agent.get('price_sensitivity', 0.5))

    # Additional Mixpanel-style data
    nps_score = agent.get('nps_score', 5)
    tenure_months = agent.get('tenure_months', 1)
    plan = agent.get('plan', 'Free')
    features_used = agent.get('features_used', [])
    churn_reason = agent.get('churn_reason', '')

    # Build behavior context from traits
    patience_desc = "patient and thoughtful" if patience > 0.7 else "quick to judge" if patience < 0.3 else "moderate patience"
    tech_desc = "highly technical" if tech_level > 0.7 else "non-technical" if tech_level < 0.3 else "somewhat technical"
    price_desc = "cost-conscious" if price_sensitivity > 0.7 else "willing to pay for value" if price_sensitivity < 0.3 else "price-aware"

    # Segment-specific style with NPS influence
    if segment == 'power_user':
        if nps_score >= 8:
            style = "You love Strava and want it to keep improving. Share how this would affect your training or segment hunting."
        else:
            style = "You use Strava heavily but have high standards. Point out what needs improving before this feature ships."
    elif segment == 'churned':
        reason = churn_reason or "it did not meet your needs"
        style = f"You left Strava because: {reason}. Be skeptical but fair about whether this addresses your concerns."
    elif segment == 'new_user':
        if nps_score >= 7:
            style = "You're excited about Strava and curious. Ask how this fits with what you're learning as a new athlete."
        else:
            style = "You're still figuring out Strava. Express confusion or ask for clarification."
    else:
        style = "You're a practical Strava user. Focus on whether this helps your day-to-day training and activity logging."

    # Build rich context with product awareness
    context = f"""You are {agent.get('name')}, a {segment.replace('_', ' ')} of Strava (social fitness tracking app for runners and cyclists).

ABOUT STRAVA: {PRODUCT_CONTEXT}

YOUR PROFILE:
- {bio}
- {status}
- On {plan} plan for {tenure_months} months
- NPS score: {nps_score}/10
- You are {patience_desc}, {tech_desc}, and {price_desc}
- Strava features you use most: {', '.join(features_used[:3]) if features_used else 'basic features'}

The Strava PM posted about a new feature:
"{post_content[:400]}"

{style}

Write a realistic Reddit-style comment (1-2 sentences). Reference YOUR specific experience with Strava. Be authentic.
Also indicate sentiment: positive, negative, or neutral.

Respond ONLY in JSON: {{"content": "your comment", "sentiment": "positive|negative|neutral"}}"""

    prompt = context

    try:
        response = llm.generate(prompt, max_tokens=150)
        import re
        json_match = re.search(r'\{[^}]+\}', response)
        if json_match:
            data = json.loads(json_match.group())
            return {
                'content': data.get('content', response[:100]),
                'sentiment': data.get('sentiment', 'neutral')
            }
    except Exception as e:
        logger.warning(f"Comment LLM error: {e}")

    # Fallback
    fallbacks = {
        'power_user': ("This looks promising but I'd need to see how it handles edge cases.", "neutral"),
        'casual': ("Cool feature! Looking forward to trying it.", "positive"),
        'new_user': ("Interesting! Will there be a tutorial for this?", "positive"),
        'churned': ("Would have been nice to have this before I left.", "negative")
    }
    fb = fallbacks.get(segment, fallbacks['casual'])
    return {'content': fb[0], 'sentiment': fb[1]}


def _generate_agent_reply(llm: LLMClient, agent: Dict, parent_comment: Dict) -> Dict:
    """Generate a reply to another agent's comment (using rich synthetic traits)"""
    segment = agent.get('segment', 'casual')
    bio = agent.get('bio', '')
    features_used = agent.get('features_used', [])
    parent_segment = parent_comment.get('segment', 'casual')
    parent_sentiment = parent_comment.get('sentiment', 'neutral')

    # Get NPS for tone
    nps_score = agent.get('nps_score', 5)
    churn_reason = agent.get('churn_reason', '')

    # Different reply dynamics based on segments and sentiment
    if segment == 'power_user' and parent_segment == 'new_user':
        style = "Help the new Strava user, share your experience with training or segments, be welcoming but informative."
    elif segment == 'churned' and parent_sentiment == 'positive':
        if churn_reason:
            style = f"Push back gently. You left Strava because of {churn_reason}. See if they've considered that."
        else:
            style = "Respectfully disagree or share why you're skeptical about Strava based on past experience."
    elif segment == 'new_user' and parent_segment == 'power_user':
        style = "Thank them for the Strava tip or ask a follow-up question about training or the app."
    elif segment == 'power_user' and parent_segment == 'churned':
        if nps_score >= 8:
            style = "Acknowledge their concerns but share why you stayed with Strava and what's improved."
        else:
            style = "You understand their Strava frustration. Validate or add your own concerns about the platform."
    else:
        style = "Engage naturally about Strava - agree, disagree, or add your perspective as a fellow athlete."

    features_str = ', '.join(features_used[:2]) if features_used else 'basic features'

    prompt = f"""You are {agent.get('name')}, a {segment.replace('_', ' ')} of Strava (social fitness tracking app).
About you: {bio[:100] if bio else 'A ' + segment.replace('_', ' ')}. You use: {features_str}.

Another Strava user ({parent_comment['agent_name']}, a {parent_segment.replace('_', ' ')}) wrote:
"{parent_comment['content']}"

{style}

Write a brief reply (1 sentence). Be conversational and Reddit-style. Reference Strava or your training if relevant.
Also indicate your sentiment: positive, negative, or neutral.

Respond ONLY in JSON: {{"content": "your reply", "sentiment": "positive|negative|neutral"}}"""

    try:
        response = llm.generate(prompt, max_tokens=100)
        import re
        json_match = re.search(r'\{[^}]+\}', response)
        if json_match:
            data = json.loads(json_match.group())
            return {
                'content': data.get('content', response[:80]),
                'sentiment': data.get('sentiment', 'neutral')
            }
    except Exception as e:
        logger.warning(f"Reply LLM error: {e}")

    # Fallback
    return {'content': "Interesting point, thanks for sharing.", 'sentiment': 'neutral'}


def calculate_adoption_score(stats: Dict[str, int]) -> float:
    """
    Calculate adoption score based on agent responses

    Positive responses increase score, negative decrease
    """
    total = stats['comments'] + stats['upvotes'] + stats['downvotes']
    if total == 0:
        return 0.5  # Neutral

    positive = stats['upvotes']
    negative = stats['downvotes']

    # Weight comments by sentiment (would be calculated from actual sentiment)
    # For now, assume 50% positive, 30% neutral, 20% negative
    comment_positive = int(stats['comments'] * 0.5)
    comment_negative = int(stats['comments'] * 0.2)

    positive += comment_positive
    negative += comment_negative

    score = (positive - negative) / total
    # Normalize to 0-1 range
    score = (score + 1) / 2

    return round(score, 2)


# ============================================================================
# LIVE AGENT SIMULATION - Continuous Loop with Tools
# ============================================================================

# Store for live simulation state
_live_simulations: Dict[str, Dict] = {}  # topic_id -> simulation state


@forum_bp.route('/stream-live', methods=['POST'])
def stream_live_simulation():
    """
    Start a live, continuous agent simulation with tools.

    Agents run in a loop, each deciding what action to take:
    - post_comment: Comment on the main post
    - reply_to_comment: Reply to another user's comment
    - upvote: Upvote a post or comment
    - downvote: Downvote a post or comment
    - create_post: Create a new discussion post (rare)

    Request (JSON):
        {
            "topic_id": "topic_abc",
            "post_id": "post_123",
            "post_content": "Feature description...",
            "agents": [...],
            "rounds": 50,  # Number of agent actions (default 50)
            "delay_ms": 800  # Delay between actions (default 800ms)
        }

    SSE Events stream continuously until complete.
    """
    data = request.get_json() or {}
    topic_id = data.get('topic_id')
    post_id = data.get('post_id')
    post_content = data.get('post_content', '')
    post_title = data.get('post_title', 'Feature Proposal')
    agents_data = data.get('agents', [])
    rounds = data.get('rounds', 50)
    delay_ms = data.get('delay_ms', 800)

    if not topic_id or not post_id:
        return jsonify({'success': False, 'error': 'topic_id and post_id required'}), 400

    if not agents_data:
        return jsonify({'success': False, 'error': 'agents required'}), 400

    def generate():
        try:
            llm = LLMClient()

            # Simulation state
            state = {
                'comments': [],  # All comments/replies
                'posts': [{
                    'id': post_id,
                    'title': post_title,
                    'content': post_content,
                    'author': 'Product Manager',
                    'upvotes': 1,
                    'downvotes': 0
                }],
                'stats': {
                    'total_actions': 0,
                    'comments': 0,
                    'replies': 0,
                    'upvotes': 0,
                    'downvotes': 0,
                    'new_posts': 0
                },
                'sentiment': {'positive': 0, 'negative': 0, 'neutral': 0}
            }

            # Store simulation state
            _live_simulations[topic_id] = state

            yield f"data: {json.dumps({'type': 'start', 'message': f'Starting live simulation with {len(agents_data)} agents...', 'agent_count': len(agents_data)})}\n\n"

            # Build agent queue - each agent can act multiple times
            agent_queue = []
            for _ in range(rounds // len(agents_data) + 1):
                shuffled = list(agents_data)
                random.shuffle(shuffled)
                agent_queue.extend(shuffled)
            agent_queue = agent_queue[:rounds]

            for round_num, agent in enumerate(agent_queue):
                try:
                    # Agent decides what tool to use based on context
                    action = _agent_choose_action(agent, state)

                    if action['tool'] == 'post_comment':
                        result = _execute_post_comment(llm, agent, state, post_content)
                        if result:
                            state['comments'].append(result)
                            state['stats']['comments'] += 1
                            state['sentiment'][result.get('sentiment', 'neutral')] += 1

                            event_data = {
                                'type': 'comment',
                                'round': round_num + 1,
                                'total_rounds': rounds,
                                **result
                            }
                            yield f"data: {json.dumps(event_data)}\n\n"

                    elif action['tool'] == 'reply_to_comment':
                        target = action.get('target')
                        if target:
                            result = _execute_reply(llm, agent, state, target)
                            if result:
                                state['comments'].append(result)
                                state['stats']['replies'] += 1
                                state['sentiment'][result.get('sentiment', 'neutral')] += 1

                                event_data = {
                                    'type': 'reply',
                                    'round': round_num + 1,
                                    'total_rounds': rounds,
                                    **result
                                }
                                yield f"data: {json.dumps(event_data)}\n\n"

                    elif action['tool'] == 'upvote':
                        target_type = action.get('target_type', 'post')
                        target_id = action.get('target_id', post_id)
                        state['stats']['upvotes'] += 1

                        event_data = {
                            'type': 'vote',
                            'vote_type': 'upvote',
                            'round': round_num + 1,
                            'agent_id': agent.get('id'),
                            'agent_name': agent.get('name'),
                            'segment': agent.get('segment'),
                            'target_type': target_type,
                            'target_id': target_id
                        }
                        yield f"data: {json.dumps(event_data)}\n\n"

                    elif action['tool'] == 'downvote':
                        target_type = action.get('target_type', 'post')
                        target_id = action.get('target_id', post_id)
                        state['stats']['downvotes'] += 1

                        event_data = {
                            'type': 'vote',
                            'vote_type': 'downvote',
                            'round': round_num + 1,
                            'agent_id': agent.get('id'),
                            'agent_name': agent.get('name'),
                            'segment': agent.get('segment'),
                            'target_type': target_type,
                            'target_id': target_id
                        }
                        yield f"data: {json.dumps(event_data)}\n\n"

                    elif action['tool'] == 'create_post':
                        result = _execute_create_post(llm, agent, state, post_content)
                        if result:
                            state['posts'].append(result)
                            state['stats']['new_posts'] += 1

                            event_data = {
                                'type': 'new_post',
                                'round': round_num + 1,
                                **result
                            }
                            yield f"data: {json.dumps(event_data)}\n\n"

                    state['stats']['total_actions'] += 1

                    # Delay between actions
                    time.sleep(delay_ms / 1000.0)

                except Exception as e:
                    logger.warning(f"Agent action error (round {round_num}): {e}")
                    continue

            # Completion
            adoption_score = _calculate_live_adoption(state)

            completion_data = {
                'type': 'complete',
                'stats': state['stats'],
                'sentiment': state['sentiment'],
                'adoption_score': adoption_score,
                'total_comments': len(state['comments']),
                'total_posts': len(state['posts'])
            }
            yield f"data: {json.dumps(completion_data)}\n\n"

            logger.info(f"Live simulation complete for {topic_id}: {state['stats']}")

        except Exception as e:
            logger.error(f"Live simulation error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*'
        }
    )


def _agent_choose_action(agent: Dict, state: Dict) -> Dict:
    """
    Agent decides which tool/action to use based on context.
    Uses agent traits to influence decision.
    """
    comments = state['comments']
    segment = agent.get('segment', 'casual')
    patience = agent.get('patience', 0.5)
    nps_score = agent.get('nps_score', 5)

    # Count how many times this agent has already acted
    agent_actions = sum(1 for c in comments if c.get('agent_id') == agent.get('id'))

    # Base probabilities for each action
    probs = {
        'post_comment': 0.4,
        'reply_to_comment': 0.35,
        'upvote': 0.15,
        'downvote': 0.05,
        'create_post': 0.02,
        'skip': 0.03
    }

    # Adjust based on agent traits and state
    if len(comments) < 5:
        # Early in discussion - more comments, fewer replies
        probs['post_comment'] = 0.7
        probs['reply_to_comment'] = 0.1

    if agent_actions >= 2:
        # Agent has acted before - more likely to reply or vote
        probs['post_comment'] = 0.15
        probs['reply_to_comment'] = 0.45
        probs['upvote'] = 0.25
        probs['downvote'] = 0.1

    # Churned users more likely to downvote
    if segment == 'churned':
        probs['downvote'] = 0.15
        probs['upvote'] = 0.05

    # High NPS users upvote more
    if nps_score >= 8:
        probs['upvote'] = 0.25
        probs['downvote'] = 0.02

    # Power users create more posts
    if segment == 'power_user' and len(state['posts']) < 3:
        probs['create_post'] = 0.08

    # Normalize probabilities
    total = sum(probs.values())
    probs = {k: v/total for k, v in probs.items()}

    # Choose action
    action = random.choices(
        list(probs.keys()),
        weights=list(probs.values()),
        k=1
    )[0]

    result = {'tool': action}

    # If replying, choose a target comment
    if action == 'reply_to_comment' and comments:
        # Prefer comments with different sentiment or from different segments
        candidates = [c for c in comments if c.get('agent_id') != agent.get('id')]
        if candidates:
            # Weight by recency and engagement potential
            weights = []
            for c in candidates:
                weight = 1.0
                # Prefer recent comments
                idx = comments.index(c)
                weight *= (1 + idx * 0.1)
                # Prefer opposing sentiment or power users
                if c.get('sentiment') != 'neutral':
                    weight *= 1.5
                if c.get('segment') == 'power_user':
                    weight *= 1.3
                weights.append(weight)

            target = random.choices(candidates, weights=weights, k=1)[0]
            result['target'] = target
        else:
            result['tool'] = 'post_comment'  # Fallback to comment

    # If voting, choose a target
    if action in ['upvote', 'downvote']:
        # 70% vote on post, 30% on comments
        if random.random() < 0.3 and comments:
            target_comment = random.choice(comments)
            result['target_type'] = 'comment'
            result['target_id'] = target_comment.get('id')
        else:
            result['target_type'] = 'post'
            result['target_id'] = state['posts'][0]['id'] if state['posts'] else None

    return result


# Product context for Strava
PRODUCT_CONTEXT = """Strava is a social fitness app used by runners, cyclists, and triathletes to track activities via GPS, compete on segments, follow other athletes, and join clubs.
Key features: Activity Recording, GPS Tracking, Segments & KOMs, Route Builder, Clubs, Training Plans, Beacon (live tracking), Heart Rate Analysis, Power Meter Analysis, Heatmaps, and Monthly Challenges.
Users range from casual joggers logging weekend runs to elite athletes obsessing over power data and segment leaderboards. Summit is the paid subscription tier."""


def _execute_post_comment(llm: LLMClient, agent: Dict, state: Dict, post_content: str) -> Optional[Dict]:
    """Execute the post_comment tool - agent comments on the main post"""
    segment = agent.get('segment', 'casual')
    bio = agent.get('bio', '')
    nps_score = agent.get('nps_score', 5)
    features_used = agent.get('features_used', [])
    churn_reason = agent.get('churn_reason', '')
    tenure = agent.get('tenure_months', 1)
    plan = agent.get('plan', 'Free')

    # Check if there's existing discussion to reference
    existing_comments = state['comments'][-5:] if state['comments'] else []
    discussion_context = ""
    if existing_comments:
        discussion_context = "\n\nOther users are saying:\n" + "\n".join([
            f"- {c['agent_name']}: \"{c['content'][:80]}...\""
            for c in existing_comments
        ])

    # Build persona prompt
    if segment == 'power_user':
        tone = "direct and opinionated, sharing expertise"
    elif segment == 'churned':
        reason = churn_reason or "unmet needs"
        tone = f"skeptical but fair, you left because of {reason}"
    elif segment == 'new_user':
        tone = "curious and eager to learn"
    else:
        tone = "practical and focused on personal use"

    prompt = f"""You are {agent.get('name')}, a {segment.replace('_', ' ')} of Strava on {plan} plan ({tenure} months).

PRODUCT: {PRODUCT_CONTEXT}

YOUR PROFILE:
{bio[:100] if bio else ''}
NPS: {nps_score}/10. Features you use: {', '.join(features_used[:3]) if features_used else 'basic features'}.

The Strava PM posted about a new feature:
"{post_content[:300]}"
{discussion_context}

Write a Reddit-style comment (1-2 sentences). Your tone is {tone}.
Reference YOUR experience with Strava and how this feature would affect YOUR training or activity tracking.

JSON only: {{"content": "your comment", "sentiment": "positive|negative|neutral"}}"""

    try:
        response = llm.generate(prompt, max_tokens=150)
        import re
        json_match = re.search(r'\{[^}]+\}', response)
        if json_match:
            data = json.loads(json_match.group())
            return {
                'id': f"comment_{uuid.uuid4().hex[:8]}",
                'agent_id': agent.get('id'),
                'agent_name': agent.get('name'),
                'segment': segment,
                'segment_color': agent.get('segment_color', '#8B5CF6'),
                'content': data.get('content', ''),
                'sentiment': data.get('sentiment', 'neutral'),
                'parent_id': None,
                'upvotes': random.randint(1, 15),
                'downvotes': random.randint(0, 3)
            }
    except Exception as e:
        logger.warning(f"Comment generation failed: {e}")

    return None


def _execute_reply(llm: LLMClient, agent: Dict, state: Dict, target: Dict) -> Optional[Dict]:
    """Execute reply_to_comment tool - agent replies to another comment"""
    segment = agent.get('segment', 'casual')
    bio = agent.get('bio', '')
    nps_score = agent.get('nps_score', 5)
    features_used = agent.get('features_used', [])

    target_segment = target.get('segment', 'casual')
    target_sentiment = target.get('sentiment', 'neutral')

    # Determine reply style based on segment dynamics
    if segment == 'power_user' and target_segment == 'new_user':
        style = "helpful and mentoring"
    elif segment == 'churned' and target_sentiment == 'positive':
        style = "respectfully challenging"
    elif nps_score >= 8:
        style = "supportive and constructive"
    elif nps_score <= 4:
        style = "critical but fair"
    else:
        style = "conversational"

    features_str = ', '.join(features_used[:2]) if features_used else 'basic features'

    prompt = f"""You are {agent.get('name')}, a {segment.replace('_', ' ')} of Strava (social fitness app).
{bio[:80] if bio else ''} You mainly use: {features_str}.

{target.get('agent_name')} (a {target_segment.replace('_', ' ')}) said about a Strava feature:
"{target.get('content')}"

Write a brief reply (1 sentence). Be {style}. Reference your Strava or training experience if relevant.

JSON only: {{"content": "your reply", "sentiment": "positive|negative|neutral"}}"""

    try:
        response = llm.generate(prompt, max_tokens=100)
        import re
        json_match = re.search(r'\{[^}]+\}', response)
        if json_match:
            data = json.loads(json_match.group())
            return {
                'id': f"reply_{uuid.uuid4().hex[:8]}",
                'agent_id': agent.get('id'),
                'agent_name': agent.get('name'),
                'segment': segment,
                'segment_color': agent.get('segment_color', '#8B5CF6'),
                'content': data.get('content', ''),
                'sentiment': data.get('sentiment', 'neutral'),
                'parent_id': target.get('id'),
                'parent_author': target.get('agent_name'),
                'upvotes': random.randint(1, 10),
                'downvotes': random.randint(0, 2)
            }
    except Exception as e:
        logger.warning(f"Reply generation failed: {e}")

    return None


def _execute_create_post(llm: LLMClient, agent: Dict, state: Dict, original_content: str) -> Optional[Dict]:
    """Execute create_post tool - agent creates a new discussion post (rare action)"""
    segment = agent.get('segment', 'casual')
    bio = agent.get('bio', '')
    features_used = agent.get('features_used', [])
    churn_reason = agent.get('churn_reason', '')

    # Only power users or churned users would create posts
    if segment not in ['power_user', 'churned']:
        return None

    if segment == 'power_user':
        topic_type = "feature request or improvement idea for Strava"
    else:
        reason = churn_reason or "limitations you experienced"
        topic_type = f"concern about {reason}"

    features_str = ', '.join(features_used[:3]) if features_used else 'the platform'

    prompt = f"""You are {agent.get('name')}, a {segment.replace('_', ' ')} of Strava (social fitness app).
{bio[:100] if bio else ''} You use: {features_str}.

Based on the PM's announcement about a new Strava feature, create a {topic_type}.
Write a Reddit-style post title and brief content (2-3 sentences) about Strava.

JSON only: {{"title": "Post title", "content": "Post content"}}"""

    try:
        response = llm.generate(prompt, max_tokens=200)
        import re
        json_match = re.search(r'\{[^}]+\}', response)
        if json_match:
            data = json.loads(json_match.group())
            return {
                'id': f"post_{uuid.uuid4().hex[:8]}",
                'agent_id': agent.get('id'),
                'agent_name': agent.get('name'),
                'segment': segment,
                'segment_color': agent.get('segment_color', '#8B5CF6'),
                'title': data.get('title', 'New Discussion'),
                'content': data.get('content', ''),
                'upvotes': random.randint(1, 10),
                'downvotes': random.randint(0, 2)
            }
    except Exception as e:
        logger.warning(f"Post creation failed: {e}")

    return None


def _calculate_live_adoption(state: Dict) -> float:
    """Calculate adoption score from live simulation state"""
    sentiment = state['sentiment']
    total = sentiment['positive'] + sentiment['negative'] + sentiment['neutral']

    if total == 0:
        return 50.0

    # Weighted score: positive = 1, neutral = 0.5, negative = 0
    score = (sentiment['positive'] * 1.0 + sentiment['neutral'] * 0.5) / total

    # Factor in upvotes/downvotes
    stats = state['stats']
    vote_ratio = 0.5
    if stats['upvotes'] + stats['downvotes'] > 0:
        vote_ratio = stats['upvotes'] / (stats['upvotes'] + stats['downvotes'])

    # Combine sentiment and votes
    final_score = (score * 0.7 + vote_ratio * 0.3) * 100

    return round(final_score, 1)


@forum_bp.route('/simulation-state/<topic_id>', methods=['GET'])
def get_simulation_state(topic_id: str):
    """Get the current state of a live simulation"""
    state = _live_simulations.get(topic_id)

    if not state:
        return jsonify({'success': False, 'error': 'No active simulation'}), 404

    return jsonify({
        'success': True,
        'state': {
            'comments': state['comments'],
            'posts': state['posts'],
            'stats': state['stats'],
            'sentiment': state['sentiment'],
            'adoption_score': _calculate_live_adoption(state)
        }
    })


# ============================================================================
# PERSISTENT STORAGE - Save/Load Topics, Posts, Comments
# ============================================================================

@forum_bp.route('/save-state/<topic_id>', methods=['POST'])
def save_state(topic_id: str):
    """Save the full state of a topic (for persistence/sharing)"""
    try:
        data = request.get_json() or {}

        if topic_id not in _topics:
            return jsonify({'success': False, 'error': 'Topic not found'}), 404

        # Update topic with any new data
        topic = _topics[topic_id]

        # Save comments to posts
        comments = data.get('comments', [])
        post_id = data.get('post_id')

        if post_id and post_id in _posts:
            _posts[post_id]['comments'] = comments
            _posts[post_id]['comment_count'] = len(comments)

        # Save stats
        if 'stats' in data:
            topic['stats'] = data['stats']

        # Save agents if provided
        agents = data.get('agents', [])
        graph_id = topic.get('graph_id')
        if agents and graph_id:
            from ..services.forum_agent_generator import ForumAgent
            agents_list = []
            for agent_dict in agents:
                agent = ForumAgent(
                    id=agent_dict.get('id', ''),
                    name=agent_dict.get('name', 'Unknown'),
                    avatar=agent_dict.get('avatar', ''),
                    segment=agent_dict.get('segment', 'casual'),
                    segment_color=agent_dict.get('segment_color', '#8E8E93'),
                    entity_id=agent_dict.get('entity_id'),
                    entity_type=agent_dict.get('entity_type', 'Person'),
                    entity_summary=agent_dict.get('entity_summary', '')
                )
                agents_list.append(agent)
            _agents[graph_id] = agents_list

        logger.info(f"Saved state for topic {topic_id}")

        return jsonify({'success': True, 'topic_id': topic_id})

    except Exception as e:
        logger.error(f"Error saving state: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@forum_bp.route('/load-state/<topic_id>', methods=['GET'])
def load_state(topic_id: str):
    """Load the full state of a topic (for persistence/sharing)"""
    try:
        if topic_id not in _topics:
            return jsonify({'success': False, 'error': 'Topic not found'}), 404

        topic = _topics[topic_id]
        graph_id = topic.get('graph_id')

        # Get all posts for this topic
        topic_posts = [p for p in _posts.values() if p.get('topic_id') == topic_id]

        # Get agents
        agents = _agents.get(graph_id, [])
        agents_data = [a.to_dict() if hasattr(a, 'to_dict') else a for a in agents]

        # Get live simulation state if exists
        live_state = _live_simulations.get(topic_id)

        return jsonify({
            'success': True,
            'topic': topic,
            'posts': topic_posts,
            'agents': agents_data,
            'live_state': {
                'comments': live_state['comments'] if live_state else [],
                'stats': live_state['stats'] if live_state else {},
                'sentiment': live_state['sentiment'] if live_state else {},
                'adoption_score': _calculate_live_adoption(live_state) if live_state else 50
            } if live_state else None
        })

    except Exception as e:
        logger.error(f"Error loading state: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@forum_bp.route('/topic/<topic_id>', methods=['GET'])
def get_topic(topic_id: str):
    """Get a specific topic by ID"""
    if topic_id not in _topics:
        return jsonify({'success': False, 'error': 'Topic not found'}), 404

    topic = _topics[topic_id]
    graph_id = topic.get('graph_id')

    # Get posts for this topic
    topic_posts = [p for p in _posts.values() if p.get('topic_id') == topic_id]

    # Get agents
    agents = _agents.get(graph_id, [])
    agents_data = [a.to_dict() if hasattr(a, 'to_dict') else a for a in agents]

    # Get simulation job status
    job = _simulation_jobs.get(topic_id)

    return jsonify({
        'success': True,
        'topic': topic,
        'posts': topic_posts,
        'agents': agents_data,
        'simulation': {
            'status': job['status'] if job else 'not_started',
            'comments': job['comments'] if job else [],
            'stats': job['stats'] if job else {},
            'progress': job.get('progress', 0) if job else 0
        }
    })


# ============================================================================
# BACKGROUND SIMULATION - Runs automatically, reliably on the server
# ============================================================================

def _run_background_simulation(topic_id: str, post_id: str, post_content: str, post_title: str, agents_data: List[Dict], rounds: int = 40):
    """Run simulation in background thread - stores all results server-side"""
    logger.info(f"Starting background simulation for topic {topic_id} with {len(agents_data)} agents")

    # Initialize job state
    job = {
        'status': 'running',
        'topic_id': topic_id,
        'post_id': post_id,
        'comments': [],
        'stats': {'total_actions': 0, 'comments': 0, 'replies': 0, 'upvotes': 0, 'downvotes': 0},
        'sentiment': {'positive': 0, 'negative': 0, 'neutral': 0},
        'progress': 0,
        'started_at': time.time()
    }
    _simulation_jobs[topic_id] = job

    try:
        llm = LLMClient()

        # Build agent queue
        agent_queue = []
        for _ in range(rounds // len(agents_data) + 1):
            shuffled = list(agents_data)
            random.shuffle(shuffled)
            agent_queue.extend(shuffled)
        agent_queue = agent_queue[:rounds]

        # State for this simulation
        state = {
            'comments': [],
            'posts': [{'id': post_id, 'title': post_title, 'content': post_content}],
            'stats': job['stats'],
            'sentiment': job['sentiment']
        }

        for i, agent in enumerate(agent_queue):
            try:
                # Update progress
                job['progress'] = int((i + 1) / rounds * 100)

                # Agent decides action
                action = _agent_choose_action(agent, state)

                if action['tool'] == 'post_comment':
                    result = _execute_post_comment(llm, agent, state, post_content)
                    if result:
                        state['comments'].append(result)
                        job['comments'].append(result)
                        job['stats']['comments'] += 1
                        job['sentiment'][result.get('sentiment', 'neutral')] += 1

                        # Also store in post
                        if post_id in _posts:
                            _posts[post_id]['comments'].append(result)

                elif action['tool'] == 'reply_to_comment':
                    target = action.get('target')
                    if target:
                        result = _execute_reply(llm, agent, state, target)
                        if result:
                            state['comments'].append(result)
                            job['comments'].append(result)
                            job['stats']['replies'] += 1
                            job['sentiment'][result.get('sentiment', 'neutral')] += 1

                elif action['tool'] == 'upvote':
                    job['stats']['upvotes'] += 1
                    if post_id in _posts:
                        _posts[post_id]['upvotes'] = _posts[post_id].get('upvotes', 0) + 1

                elif action['tool'] == 'downvote':
                    job['stats']['downvotes'] += 1
                    if post_id in _posts:
                        _posts[post_id]['downvotes'] = _posts[post_id].get('downvotes', 0) + 1

                job['stats']['total_actions'] += 1

                # Delay between actions
                time.sleep(1.0)

            except Exception as e:
                logger.warning(f"Background simulation action error: {e}")
                continue

        # Complete
        job['status'] = 'completed'
        job['completed_at'] = time.time()
        job['adoption_score'] = _calculate_live_adoption({'sentiment': job['sentiment'], 'stats': job['stats']})

        logger.info(f"Background simulation completed for topic {topic_id}: {job['stats']}")

    except Exception as e:
        logger.error(f"Background simulation error: {e}")
        job['status'] = 'error'
        job['error'] = str(e)


def start_background_simulation(topic_id: str, post_id: str, post_content: str, post_title: str, agents_data: List[Dict], rounds: int = 40):
    """Start a background simulation thread"""
    # Check if already running
    if topic_id in _simulation_jobs and _simulation_jobs[topic_id].get('status') == 'running':
        logger.warning(f"Simulation already running for topic {topic_id}")
        return False

    # Start thread
    thread = threading.Thread(
        target=_run_background_simulation,
        args=(topic_id, post_id, post_content, post_title, agents_data, rounds),
        daemon=True
    )
    _simulation_threads[topic_id] = thread
    thread.start()

    logger.info(f"Started background simulation thread for topic {topic_id}")
    return True


@forum_bp.route('/start-simulation', methods=['POST'])
def start_simulation_endpoint():
    """Manually start a background simulation for a topic"""
    data = request.get_json() or {}
    topic_id = data.get('topic_id')
    post_id = data.get('post_id')
    agents_data = data.get('agents', [])
    rounds = data.get('rounds', 40)

    if not topic_id or not post_id:
        return jsonify({'success': False, 'error': 'topic_id and post_id required'}), 400

    if not agents_data:
        return jsonify({'success': False, 'error': 'agents required'}), 400

    # Get post content
    post = _posts.get(post_id, {})
    post_content = post.get('content', data.get('post_content', ''))
    post_title = post.get('title', data.get('post_title', 'Feature Proposal'))

    # Start background simulation
    started = start_background_simulation(topic_id, post_id, post_content, post_title, agents_data, rounds)

    return jsonify({
        'success': started,
        'message': 'Simulation started' if started else 'Simulation already running'
    })


@forum_bp.route('/simulation-status/<topic_id>', methods=['GET'])
def get_simulation_status(topic_id: str):
    """Get the status and results of a background simulation"""
    job = _simulation_jobs.get(topic_id)

    if not job:
        return jsonify({
            'success': True,
            'status': 'not_started',
            'comments': [],
            'stats': {},
            'progress': 0
        })

    return jsonify({
        'success': True,
        'status': job['status'],
        'comments': job['comments'],
        'stats': job['stats'],
        'sentiment': job['sentiment'],
        'progress': job['progress'],
        'adoption_score': job.get('adoption_score', 50)
    })


@forum_bp.route('/simulation-stream/<topic_id>', methods=['GET'])
def stream_simulation_updates(topic_id: str):
    """Stream simulation updates as SSE - for real-time UI updates"""
    def generate():
        last_count = 0
        check_count = 0
        max_checks = 300  # 5 minutes at 1 second intervals

        while check_count < max_checks:
            job = _simulation_jobs.get(topic_id)

            if not job:
                yield f"data: {json.dumps({'type': 'waiting', 'message': 'Waiting for simulation to start...'})}\n\n"
                time.sleep(1)
                check_count += 1
                continue

            # Send new comments since last check
            current_comments = job['comments']
            if len(current_comments) > last_count:
                for comment in current_comments[last_count:]:
                    yield f"data: {json.dumps({'type': 'comment' if not comment.get('parent_id') else 'reply', **comment})}\n\n"
                last_count = len(current_comments)

            # Send status update
            yield f"data: {json.dumps({'type': 'status', 'status': job['status'], 'progress': job['progress'], 'stats': job['stats']})}\n\n"

            # Check if completed
            if job['status'] in ['completed', 'error']:
                yield f"data: {json.dumps({'type': 'complete', 'stats': job['stats'], 'adoption_score': job.get('adoption_score', 50)})}\n\n"
                break

            time.sleep(1)
            check_count += 1

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*'
        }
    )



@forum_bp.route('/suggest-revision', methods=['POST'])
def suggest_revision():
    """
    Given a feature description and simulation feedback, suggest a revised feature.
    """
    try:
        data = request.get_json()
        original_feature = data.get('feature', '')
        reactions = data.get('reactions', [])
        forum_events = data.get('forum_events', [])

        if not original_feature:
            return jsonify({'success': False, 'error': 'feature text required'}), 400

        feedback_lines = []
        for r in reactions[:30]:
            sentiment = r.get('sentiment', 'neutral')
            segment = r.get('segment', '').replace('_', ' ')
            comment = r.get('comment', '')
            feedback_lines.append(f"[{segment}, {sentiment}] {comment}")

        for e in forum_events[:40]:
            if e.get('type') in ('comment', 'reply') and e.get('content'):
                sentiment = e.get('sentiment', 'neutral')
                segment = e.get('segment', '').replace('_', ' ')
                content = e.get('content', '')
                feedback_lines.append(f"[{segment}, {sentiment}] {content}")

        feedback_text = '\n'.join(feedback_lines[:50])

        prompt = f"""You are a product manager synthesizing user simulation feedback to improve a feature proposal.

Original feature:
{original_feature}

Simulated user feedback ({len(feedback_lines)} responses):
{feedback_text}

Based on this feedback, write an improved version of the feature proposal that:
- Addresses the most common concerns or objections
- Keeps what users responded positively to
- Is specific and actionable (2-4 sentences)
- Does NOT include meta-commentary like "Based on feedback..." - just write the revised feature description directly

Revised feature:"""

        llm = LLMClient()
        suggestion = llm.generate(prompt, temperature=0.6, max_tokens=300).strip()

        for prefix in ["Revised feature:", "Improved feature:", "Revised:", "Improved:"]:
            if suggestion.startswith(prefix):
                suggestion = suggestion[len(prefix):].strip()

        return jsonify({'success': True, 'suggestion': suggestion})

    except Exception as e:
        logger.error(f"suggest_revision error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
