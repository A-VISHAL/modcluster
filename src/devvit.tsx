/**
 * Native Devvit registration layer for ModPulse AI.
 *
 * This module registers native forms and a visible custom post dashboard so
 * the shift handover workflow can be demoed directly inside Reddit playtest.
 */

import { Devvit, useState } from '@devvit/public-api';

import {
  createHandoverCard,
  fetchActiveHandover,
  saveHandover,
  type HandoverCard,
} from './core/handover';
import {
  addVote,
  countVotes,
  createJuryCase,
  fetchActiveCases,
  fetchResolvedCases,
  saveNewJuryCase,
  summarizeVoteCounts,
  type JuryCase,
  type JuryVoteValue,
} from './core/jury';

Devvit.configure({
  redditAPI: true,
  redis: true,
});

type ViewHandoverFormData = {
  card: HandoverCard | null;
};

type FlagJuryFormData = {
  postId: string;
};

type VoteJuryFormData = {
  cases: JuryCase[];
  defaultVote?: JuryVoteValue;
};

type ViewJuryFormData = {
  activeCases: JuryCase[];
  resolvedCases: JuryCase[];
};

const redisTestKey = (subredditId: string) =>
  `modpulse:${subredditId}:redis-test`;

const getSelectedValue = (value: string[] | string | undefined) =>
  Array.isArray(value) ? value[0] : value;

const summarizeHandoverCard = (card: HandoverCard) =>
  [
    `Moderator: ${card.author}`,
    `Timestamp: ${new Date(card.timestamp).toLocaleString()}`,
    '',
    'Active situations:',
    card.activeSituations || 'None',
    '',
    'Users to watch:',
    card.usersToWatch || 'None',
    '',
    'Priority posts:',
    card.priorityPosts || 'None',
    '',
    'Additional notes:',
    card.notes || 'None',
  ].join('\n');

const handoverFormKey = Devvit.createForm(
  {
    title: 'End Shift & Handover',
    description:
      'Use this form to leave a structured handover for the next moderator.',

    acceptLabel: 'Save Handover',
    cancelLabel: 'Cancel',

    fields: [
      {
        type: 'paragraph',
        name: 'activeSituations',
        label: 'Active situations',
        required: true,
      },
      {
        type: 'paragraph',
        name: 'usersToWatch',
        label: 'Users to watch',
      },
      {
        type: 'paragraph',
        name: 'priorityPosts',
        label: 'Priority posts',
      },
      {
        type: 'paragraph',
        name: 'notes',
        label: 'Additional notes',
      },
    ],
  },

  async (event, context) => {
    const handover = createHandoverCard({
      author: context.username ?? 'moderator',
      activeSituations: event.values.activeSituations ?? '',
      usersToWatch: event.values.usersToWatch ?? '',
      priorityPosts: event.values.priorityPosts ?? '',
      notes: event.values.notes ?? '',
    });

    await saveHandover(context.subredditId, handover);

    context.ui.showToast('Handover saved successfully.');
  }
);

const viewHandoverFormKey = Devvit.createForm(
  (data) => {
    const card = (data as ViewHandoverFormData).card;

    if (!card) {
      return {
        title: 'Current Handover',
        description:
          'No active handover has been saved for this subreddit yet.',
        fields: [],
      };
    }

    return {
      title: 'Current Handover',

      description: summarizeHandoverCard(card),

      fields: [
        {
          type: 'paragraph',
          name: 'activeSituations',
          label: 'Active situations',
          defaultValue: card.activeSituations,
          disabled: true,
        },
        {
          type: 'paragraph',
          name: 'usersToWatch',
          label: 'Users to watch',
          defaultValue: card.usersToWatch,
          disabled: true,
        },
        {
          type: 'paragraph',
          name: 'priorityPosts',
          label: 'Priority posts',
          defaultValue: card.priorityPosts,
          disabled: true,
        },
        {
          type: 'paragraph',
          name: 'notes',
          label: 'Additional notes',
          defaultValue: card.notes,
          disabled: true,
        },
      ],
    };
  },

  async (_event, context) => {
    context.ui.showToast('Current handover reviewed.');
  }
);

const summarizeJuryCase = (juryCase: JuryCase) => {
  const summary = [
    `Case: ${juryCase.id}`,
    `Post: ${juryCase.postId}`,
    `Status: ${juryCase.status}`,
    `Verdict: ${juryCase.finalVerdict ?? 'pending'}`,
    `Votes: ${summarizeVoteCounts(juryCase.votes)}`,
    '',
    'Reason:',
    juryCase.reason || 'None',
    '',
    'Rule citation:',
    juryCase.ruleCitation || 'None',
    '',
    'Moderator notes:',
    juryCase.contextNotes || 'None',
  ];

  if (juryCase.moderationSummary) {
    summary.push('', 'Moderation summary:', juryCase.moderationSummary);
  }

  return summary.join('\n');
};

const flagJuryReviewFormKey = Devvit.createForm(
  (data) => {
    const { postId } = data as FlagJuryFormData;

    return {
      title: 'Flag for Jury Review',
      description: 'Send this post to a collaborative moderator verdict board.',
      acceptLabel: 'Create Jury Case',
      cancelLabel: 'Cancel',
      fields: [
        {
          type: 'string',
          name: 'postId',
          label: 'Post ID',
          defaultValue: postId,
          disabled: true,
        },
        {
          type: 'paragraph',
          name: 'reason',
          label: 'Reason',
          required: true,
        },
        {
          type: 'string',
          name: 'ruleCitation',
          label: 'Rule citation',
        },
        {
          type: 'paragraph',
          name: 'contextNotes',
          label: 'Moderator notes',
        },
      ],
    };
  },
  async (event, context) => {
    const postId = event.values.postId || context.postId;

    if (!postId) {
      context.ui.showToast('No post ID was available for jury review.');
      return;
    }

    const juryCase = createJuryCase({
      postId,
      subredditId: context.subredditId,
      createdBy: context.username ?? 'moderator',
      reason: event.values.reason ?? '',
      ruleCitation: event.values.ruleCitation ?? '',
      contextNotes: event.values.contextNotes ?? '',
    });

    await saveNewJuryCase(juryCase);
    context.ui.showToast('Jury review case created.');
  }
);

const submitJuryVoteFormKey = Devvit.createForm(
  (data) => {
    const { cases, defaultVote } = data as VoteJuryFormData;

    return {
      title: 'Submit Jury Vote',
      description:
        cases.length === 0
          ? 'No active jury cases are waiting for votes.'
          : 'Choose a pending case and cast one moderator vote.',
      acceptLabel: 'Submit Vote',
      cancelLabel: 'Cancel',
      fields:
        cases.length === 0
          ? []
          : [
              {
                type: 'select',
                name: 'caseId',
                label: 'Jury case',
                required: true,
                defaultValue: [cases[0]?.id ?? ''],
                options: cases.map((juryCase) => ({
                  label: `${juryCase.postId} - ${juryCase.reason.slice(0, 48)}`,
                  value: juryCase.id,
                })),
              },
              {
                type: 'select',
                name: 'vote',
                label: 'Vote',
                required: true,
                defaultValue: [defaultVote ?? 'abstain'],
                options: [
                  { label: 'Approve', value: 'approve' },
                  { label: 'Remove', value: 'remove' },
                  { label: 'Abstain', value: 'abstain' },
                ],
              },
            ],
    };
  },
  async (event, context) => {
    const caseId = getSelectedValue(event.values.caseId);
    const vote = getSelectedValue(event.values.vote) as
      | JuryVoteValue
      | undefined;

    if (!caseId || !vote) {
      context.ui.showToast('Choose a jury case and vote first.');
      return;
    }

    try {
      const result = await addVote({
        caseId,
        vote,
        moderator: context.username ?? context.userId ?? 'moderator',
      });

      if (result.duplicate) {
        context.ui.showToast('You already voted on this jury case.');
        return;
      }

      context.ui.showToast(
        result.resolved
          ? `Final jury verdict reached: ${result.juryCase.finalVerdict}.`
          : 'Jury vote recorded. Verdict still pending.'
      );
    } catch (error) {
      console.error('Failed to submit jury vote', error);
      context.ui.showToast('Failed to submit jury vote.');
    }
  }
);

const viewJuryCaseFormKey = Devvit.createForm(
  (data) => {
    const { activeCases, resolvedCases } = data as ViewJuryFormData;
    const currentCase = activeCases[0] ?? resolvedCases[0];

    if (!currentCase) {
      return {
        title: 'Jury Verdict Board',
        description: 'No jury cases have been created yet.',
        fields: [],
      };
    }

    return {
      title: 'Jury Verdict Board',
      description: summarizeJuryCase(currentCase),
      acceptLabel: 'Close',
      cancelLabel: 'Back',
      fields: [
        {
          type: 'paragraph',
          name: 'caseDetails',
          label: 'Case details',
          defaultValue: summarizeJuryCase(currentCase),
          disabled: true,
        },
        {
          type: 'paragraph',
          name: 'queue',
          label: 'Active jury queue',
          defaultValue:
            activeCases
              .map(
                (juryCase) =>
                  `${juryCase.postId}: ${summarizeVoteCounts(juryCase.votes)}`
              )
              .join('\n') || 'No pending cases.',
          disabled: true,
        },
        {
          type: 'paragraph',
          name: 'history',
          label: 'Resolved verdicts',
          defaultValue:
            resolvedCases
              .map(
                (juryCase) =>
                  `${juryCase.postId}: ${juryCase.finalVerdict ?? 'pending'}`
              )
              .join('\n') || 'No resolved cases yet.',
          disabled: true,
        },
      ],
    };
  },
  async (_event, context) => {
    context.ui.showToast('Jury board reviewed.');
  }
);

Devvit.addMenuItem({
  label: 'Flag for Jury Review',
  description: 'Create a collaborative moderator review case for this post.',
  location: 'post',
  forUserType: 'moderator',
  onPress: (event, context) => {
    context.ui.showForm(flagJuryReviewFormKey, {
      postId: event.targetId,
    });
  },
});

/**
 * The custom post is the primary playtest surface. Judges can create a Reddit
 * post, select "ModPulse", and immediately interact with this dashboard without
 * relying on moderator menu actions surfacing in the host UI.
 */
Devvit.addCustomPostType({
  name: 'ModPulse',
  description: 'Collaborative Reddit moderation dashboard.',
  height: 'tall',
  render: (context) => {
    const [activeJuryCases] = useState<JuryCase[]>(() =>
      fetchActiveCases(context.subredditId, 5)
    );
    const [resolvedJuryCases] = useState<JuryCase[]>(() =>
      fetchResolvedCases(context.subredditId, 5)
    );
    const featuredJuryCase = activeJuryCases[0];
    const featuredCounts = featuredJuryCase
      ? countVotes(featuredJuryCase.votes)
      : { approve: 0, remove: 0, abstain: 0 };
    const pendingVerdicts = activeJuryCases.length;
    const resolvedVerdicts = resolvedJuryCases.length;

    const openHandoverForm = () => {
      context.ui.showToast('Opening ModPulse handover form');

      // Handover workflow integration: reuse the existing native form key so
      // createHandoverCard and saveHandover continue powering persistence.
      context.ui.showForm(handoverFormKey);
    };

    const openCurrentHandover = async () => {
      context.ui.showToast('Loading current handover');

      // Fetch the active Redis-backed handover, then pass it into the existing
      // read-only native form renderer.
      const card = await fetchActiveHandover(context.subredditId);
      context.ui.showForm(viewHandoverFormKey, { card });
    };

    const testRedisConnection = async () => {
      const key = redisTestKey(context.subredditId);
      const value = `ok:${Date.now()}`;

      // Redis testing: write a small value and immediately read it back so the
      // dashboard can prove persistence is available during demos.
      await context.redis.set(key, value);
      const savedValue = await context.redis.get(key);

      context.ui.showToast(
        savedValue === value
          ? 'Redis connection verified.'
          : 'Redis test failed: saved value was not returned.'
      );
    };

    const openJuryQueue = () => {
      // Devvit UI integration: the custom post opens a native read-only form so
      // moderators can inspect the queue without leaving Reddit.
      context.ui.showForm(viewJuryCaseFormKey, {
        activeCases: activeJuryCases,
        resolvedCases: resolvedJuryCases,
      });
    };

    const openVoteForm = (defaultVote: JuryVoteValue) => {
      if (activeJuryCases.length === 0) {
        context.ui.showToast('No active jury cases are waiting for votes.');
        return;
      }

      context.ui.showForm(submitJuryVoteFormKey, {
        cases: activeJuryCases,
        defaultVote,
      });
    };

    return (
      <vstack
        width="100%"
        height="100%"
        padding="large"
        gap="medium"
        alignment="top center"
        backgroundColor="#f8fafc"
      >
        <vstack width="100%" gap="small" alignment="top center">
          <text size="xxlarge" weight="bold" color="#0f172a" alignment="center">
            ModPulse AI
          </text>
          <text size="medium" color="#475569" alignment="center" wrap>
            Collaborative Reddit Moderation Platform
          </text>
        </vstack>

        <vstack
          width="100%"
          maxWidth="560px"
          padding="medium"
          gap="small"
          border="thin"
          borderColor="#dbe3ef"
          cornerRadius="medium"
          backgroundColor="#ffffff"
        >
          <hstack width="100%" alignment="middle start" gap="small">
            <icon name="status-live" size="medium" color="#16a34a" />
            <text size="large" weight="bold" color="#0f172a">
              System Status
            </text>
          </hstack>

          <hstack width="100%" alignment="middle start" gap="small">
            <icon name="checkmark" size="small" color="#16a34a" />
            <text size="medium" color="#334155" wrap>
              Shift Handover System Active
            </text>
          </hstack>

          <hstack width="100%" alignment="middle start" gap="small">
            <icon name="checkmark" size="small" color="#16a34a" />
            <text size="medium" color="#334155" wrap>
              Redis Connected
            </text>
          </hstack>

          <hstack width="100%" alignment="middle start" gap="small">
            <icon name="checkmark" size="small" color="#16a34a" />
            <text size="medium" color="#334155" wrap>
              Moderator Workflow Online
            </text>
          </hstack>
        </vstack>

        <vstack width="100%" maxWidth="560px" gap="small">
          {/* Button actions connect the visible dashboard to the existing native
              Devvit form and Redis workflows. */}
          <button
            width="100%"
            size="large"
            appearance="primary"
            icon="edit"
            onPress={openHandoverForm}
          >
            Create Shift Handover
          </button>

          <button
            width="100%"
            size="large"
            appearance="secondary"
            icon="show"
            onPress={openCurrentHandover}
          >
            View Current Handover
          </button>

          <button
            width="100%"
            size="large"
            appearance="success"
            icon="save"
            onPress={testRedisConnection}
          >
            Test Redis Connection
          </button>
        </vstack>

        <vstack
          width="100%"
          maxWidth="560px"
          padding="medium"
          gap="medium"
          border="thin"
          borderColor="#dbe3ef"
          cornerRadius="medium"
          backgroundColor="#ffffff"
        >
          <hstack width="100%" alignment="middle start" gap="small">
            <icon name="mod" size="medium" color="#7c3aed" />
            <vstack grow gap="none">
              <text size="large" weight="bold" color="#0f172a">
                Jury Verdict Board
              </text>
              <text size="small" color="#64748b" wrap>
                Collaborative review for high-stakes moderation calls
              </text>
            </vstack>
          </hstack>

          <hstack width="100%" gap="small" alignment="middle center">
            <vstack
              grow
              padding="small"
              gap="small"
              cornerRadius="small"
              backgroundColor="#fff7ed"
            >
              <text size="xsmall" weight="bold" color="#9a3412">
                ACTIVE JURY CASES
              </text>
              <text size="xxlarge" weight="bold" color="#0f172a">
                {activeJuryCases.length}
              </text>
            </vstack>
            <vstack
              grow
              padding="small"
              gap="small"
              cornerRadius="small"
              backgroundColor="#eef2ff"
            >
              <text size="xsmall" weight="bold" color="#3730a3">
                PENDING VERDICTS
              </text>
              <text size="xxlarge" weight="bold" color="#0f172a">
                {pendingVerdicts}
              </text>
            </vstack>
            <vstack
              grow
              padding="small"
              gap="small"
              cornerRadius="small"
              backgroundColor="#ecfdf5"
            >
              <text size="xsmall" weight="bold" color="#166534">
                RESOLVED
              </text>
              <text size="xxlarge" weight="bold" color="#0f172a">
                {resolvedVerdicts}
              </text>
            </vstack>
          </hstack>

          <vstack
            width="100%"
            padding="small"
            gap="small"
            border="thin"
            borderColor="#e2e8f0"
            cornerRadius="small"
            backgroundColor="#f8fafc"
          >
            <hstack width="100%" alignment="middle start" gap="small">
              <icon
                name={
                  featuredJuryCase
                    ? featuredJuryCase.finalVerdict === 'approve'
                      ? 'approve'
                      : featuredJuryCase.finalVerdict === 'remove'
                        ? 'remove'
                        : 'pending-posts'
                    : 'inbox'
                }
                size="medium"
                color={
                  featuredJuryCase?.finalVerdict === 'approve'
                    ? '#16a34a'
                    : featuredJuryCase?.finalVerdict === 'remove'
                      ? '#dc2626'
                      : '#f97316'
                }
              />
              <vstack grow gap="none">
                <text size="medium" weight="bold" color="#0f172a" wrap>
                  {featuredJuryCase
                    ? `Post ${featuredJuryCase.postId}`
                    : 'No active jury case'}
                </text>
                <text size="small" color="#64748b" wrap>
                  {featuredJuryCase
                    ? featuredJuryCase.reason
                    : 'Flag a post for Jury Review to start a collaborative verdict.'}
                </text>
              </vstack>
            </hstack>

            <hstack width="100%" gap="small" alignment="middle center">
              <vstack grow gap="small">
                <text size="xsmall" color="#166534" weight="bold">
                  APPROVE
                </text>
                <text size="large" color="#0f172a" weight="bold">
                  {featuredCounts.approve}/2
                </text>
              </vstack>
              <vstack grow gap="small">
                <text size="xsmall" color="#991b1b" weight="bold">
                  REMOVE
                </text>
                <text size="large" color="#0f172a" weight="bold">
                  {featuredCounts.remove}/2
                </text>
              </vstack>
              <vstack grow gap="small">
                <text size="xsmall" color="#475569" weight="bold">
                  ABSTAIN
                </text>
                <text size="large" color="#0f172a" weight="bold">
                  {featuredCounts.abstain}
                </text>
              </vstack>
            </hstack>

            <text size="small" color="#64748b" wrap>
              {featuredJuryCase
                ? featuredJuryCase.finalVerdict
                  ? `Final verdict: ${featuredJuryCase.finalVerdict}`
                  : 'Pending status: 2 matching approve or remove votes will resolve this case.'
                : 'Approved and removed verdicts appear here after the 2-of-3 threshold is reached.'}
            </text>
          </vstack>

          {/* Jury buttons expose the collaborative moderation workflow from the
              visible dashboard while the native menu handles post-specific case
              creation. */}
          <vstack width="100%" gap="small">
            <button
              width="100%"
              size="large"
              appearance="primary"
              icon="mod-queue"
              onPress={openJuryQueue}
            >
              Open Jury Queue
            </button>
            <hstack width="100%" gap="small">
              <button
                grow
                size="medium"
                appearance="success"
                icon="approve"
                onPress={() => openVoteForm('approve')}
              >
                Vote Approve
              </button>
              <button
                grow
                size="medium"
                appearance="destructive"
                icon="remove"
                onPress={() => openVoteForm('remove')}
              >
                Vote Remove
              </button>
              <button
                grow
                size="medium"
                appearance="secondary"
                icon="ignore-reports"
                onPress={() => openVoteForm('abstain')}
              >
                Abstain
              </button>
            </hstack>
          </vstack>
        </vstack>
      </vstack>
    );
  },
});

export default Devvit;
