import { Devvit } from '@devvit/public-api';

export type TabType = 'dashboard' | 'queue' | 'jury' | 'intel';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const BottomNav = ({ currentTab, onSelectTab }: BottomNavProps) => {
  return (
    <hstack
      width="100%"
      height="64px"
      backgroundColor="neutral-background"
      borderColor="neutral-border"
      alignment="center middle"
      padding="small"
    >
      <vstack
        alignment="center middle"
        grow
        onPress={() => onSelectTab('dashboard')}
      >
        <icon name="dashboard" size="medium" color={currentTab === 'dashboard' ? 'primary-background' : 'neutral-content-weak'} />
        <text size="small" weight="bold" color={currentTab === 'dashboard' ? 'primary-background' : 'neutral-content-weak'}>
          DASH
        </text>
      </vstack>

      <vstack
        alignment="center middle"
        grow
        onPress={() => onSelectTab('queue')}
      >
        <icon name="menu" size="medium" color={currentTab === 'queue' ? 'primary-background' : 'neutral-content-weak'} />
        <text size="small" weight="bold" color={currentTab === 'queue' ? 'primary-background' : 'neutral-content-weak'}>
          QUEUE
        </text>
      </vstack>

      <vstack alignment="center middle" grow>
        <hstack
          backgroundColor="primary-background"
          cornerRadius="full"
          padding="small"
          alignment="center middle"
          onPress={() => { /* Quick action */ }}
        >
          <icon name="mod" size="medium" color="white" />
        </hstack>
      </vstack>

      <vstack
        alignment="center middle"
        grow
        onPress={() => onSelectTab('jury')}
      >
        <icon name="topic-politics" size="medium" color={currentTab === 'jury' ? 'primary-background' : 'neutral-content-weak'} />
        <text size="small" weight="bold" color={currentTab === 'jury' ? 'primary-background' : 'neutral-content-weak'}>
          JURY
        </text>
      </vstack>

      <vstack
        alignment="center middle"
        grow
        onPress={() => onSelectTab('intel')}
      >
        <icon name="activity" size="medium" color={currentTab === 'intel' ? 'primary-background' : 'neutral-content-weak'} />
        <text size="small" weight="bold" color={currentTab === 'intel' ? 'primary-background' : 'neutral-content-weak'}>
          INTEL
        </text>
      </vstack>
    </hstack>
  );
};
