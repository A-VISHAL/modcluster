import { Devvit, useState } from '@devvit/public-api';
import { BottomNav, TabType } from './components/BottomNav.js';
import { QueueScreen } from './screens/QueueScreen.js';
import { DashboardScreen } from './screens/DashboardScreen.js';
import { JuryScreen } from './screens/JuryScreen.js';
import { IntelScreen } from './screens/IntelScreen.js';

export const App = (context: Devvit.Context) => {
  const [currentTab, setCurrentTab] = useState<TabType>('queue');

  return (
    <vstack width="100%" height="100%" backgroundColor="neutral-background-weak">
      <vstack grow>
        <vstack grow>
          {currentTab === 'queue' && <QueueScreen />}
          {currentTab === 'dashboard' && <DashboardScreen />}
          {currentTab === 'jury' && <JuryScreen />}
          {currentTab === 'intel' && <IntelScreen />}
        </vstack>
      </vstack>
      <BottomNav currentTab={currentTab} onSelectTab={setCurrentTab} />
    </vstack>
  );
};
