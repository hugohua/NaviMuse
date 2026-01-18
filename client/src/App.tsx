import { useState, useEffect, startTransition, useCallback } from 'react';
import { AudioPlayerProvider } from './contexts/AudioPlayerContext';
import { QueuePanelProvider, useQueuePanel } from './contexts/QueuePanelContext';
import { UserProfileProvider, useUserProfile } from './contexts/UserProfileContext';
import { GlobalPlayer } from './components/GlobalPlayer';
import { QueueSidebar } from './components/QueueSidebar';
import { Omnibar } from './components/Omnibar';
import { TagGroup } from './components/TagGroup';
import { ResultCard } from './components/ResultCard';
import { UserProfileCard } from './components/UserProfileCard';
import { PlaylistSidebar } from './components/PlaylistSidebar';
import type { DiscoveryMode, CuratorResponse, TagCategory } from './types';
import { api } from './api';
import { usePopup } from './contexts/PopupContext';
import { ScrollArea } from './components/ui/scroll-area';
import { Button } from './components/ui/button';
import { UserNav } from './components/UserNav';
import { Menu } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMediaQuery } from './hooks/use-media-query';
import { useTheme } from './hooks/use-theme';
import { AdminMetadataView } from './components/AdminMetadataView';
import './App.css';

import { useHashLocation } from './hooks/use-hash-location';

import { SettingsPage } from './pages/SettingsPage';

function AppContent() {
  const { showPopup } = usePopup();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Routing Logic
  const [hash, navigate] = useHashLocation();
  const showAdmin = hash === '#admin';
  const showSettings = hash === '#settings';

  const setShowAdmin = (show: boolean) => {
    navigate(show ? '#admin' : '');
  };

  const [mode, setMode] = useState<DiscoveryMode>('default');

  // Wrap mode change in startTransition for smooth dropdown animation
  const handleModeChange = useCallback((newMode: DiscoveryMode) => {
    startTransition(() => {
      setMode(newMode);
    });
  }, []);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Ready');
  const [result, setResult] = useState<CuratorResponse | null>(null);
  const [tagCategories, setTagCategories] = useState<TagCategory[]>([]);

  // User Profile from Context
  const { userProfile } = useUserProfile();

  // Playlist list refresh trigger
  const [refreshPlaylists, setRefreshPlaylists] = useState(0);

  // Search Input State
  const [searchInput, setSearchInput] = useState('');

  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Init: Fetch Tags
  useEffect(() => {
    // Load Tags
    api.getTags()
      .then(setTagCategories)
      .catch(err => {
        console.error("Failed to load tags:", err);
        setStatusText("Failed to load configuration");
      });
  }, []);

  const toggleTag = (tag: string) => {
    const next = new Set(selectedTags);
    if (next.has(tag)) {
      next.delete(tag);
      // Remove tag from search input
      setSearchInput(prev => {
        // Escape special characters in tag for regex usage
        const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Regex to match the tag with surrounding boundaries or spaces
        const regex = new RegExp(`(^|\\s)${escapedTag}(?=\\s|$)`, 'g');
        return prev.replace(regex, ' ').replace(/\s+/g, ' ').trim();
      });
    } else {
      next.add(tag);
      // Add tag to search input
      setSearchInput(prev => (prev + ' ' + tag).trim());
    }
    setSelectedTags(next);
  };

  const generate = async (inputPrompt: string = '') => {
    // If inputPrompt is empty (e.g. from tags only), check if we have tags
    const activePrompt = inputPrompt || searchInput;
    const combinedPrompt = activePrompt; // Now purely relying on the input box content which includes tags

    if (!combinedPrompt) {
      showPopup({ message: '请输入提示词或选择标签', title: 'Input Required' });
      return;
    }

    if (!userProfile) {
      showPopup({ message: '请先点击 "Generate Persona" 生成用户画像，然后再生成歌单。', title: 'Persona Required' });
      return;
    }

    setLoading(true);
    setStatusText(`正在[${getModeName(mode)}]下为您生成...`);
    setResult(null);

    try {
      // Pass userProfile if exists
      const data = await api.generatePlaylist(combinedPrompt, mode, userProfile || undefined);
      setResult(data);
      setStatusText('Ready');
      // Refresh playlist list
      setRefreshPlaylists(prev => prev + 1);
    } catch (e: any) {
      console.error(e);
      showPopup({ message: 'Error: ' + e.message, title: 'Generation Failed' });
      setStatusText('Error');
    } finally {
      setLoading(false);
    }
  };

  const getModeName = (m: DiscoveryMode) => {
    if (m === 'familiar') return '熟悉模式';
    if (m === 'fresh') return '新鲜模式';
    return '默认模式';
  };

  const { isQueueOpen, setQueueOpen } = useQueuePanel();
  const { theme } = useTheme();

  if (showAdmin) {
    return (
      <div className="app-root relative z-50 bg-gray-900 flex flex-col">
        <ScrollArea className="flex-1 h-full">
          <div className="p-4 pb-20">
            <Button variant="ghost" onClick={() => navigate('')} className="mb-4 text-white hover:text-blue-300">
              ← Back to Home
            </Button>
            <AdminMetadataView />
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (showSettings) {
    return (
      <div className="app-root relative z-50 bg-gray-900 flex flex-col">
        <ScrollArea className="flex-1 h-full">
          <div className="p-4 pb-20">
            <Button variant="ghost" onClick={() => navigate('')} className="mb-4 text-white hover:text-blue-300">
              ← Back to Home
            </Button>
            <SettingsPage />
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="app-layout">
        {/* Sidebar */}
        <PlaylistSidebar
          className="sidebar"
          refreshTrigger={refreshPlaylists}
          onRefresh={() => setRefreshPlaylists(p => p + 1)}
        />

        {/* Main Content */}
        <div className="main-content">
          <UserNav />

          <ScrollArea className="scroll-container">
            <div className="content-container">
              {/* Header */}
              <header className="app-header">
                <div className="flex items-center justify-center gap-4 mb-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mobile-menu-btn"
                    onClick={() => setIsMobileMenuOpen(true)}
                  >
                    <Menu className="w-6 h-6" />
                  </Button>
                  <img
                    src={theme === 'dark' ? "/logo-dark.svg" : "/logo-light.svg"}
                    alt="NaviMuse Logo"
                    className="w-12 h-12 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setShowAdmin(true)}
                    title="Click for Admin View"
                  />
                  <h1 className="app-title" onClick={() => setShowAdmin(true)} style={{ cursor: 'pointer' }}>NaviMuse</h1>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('#settings')}
                    className="ml-2 text-xs opacity-50 hover:opacity-100"
                  >
                    Settings
                  </Button>
                </div>
                <p className="app-subtitle">AI Music Curator</p>
              </header>

              {/* Controls */}
              <Omnibar
                mode={mode}
                onModeChange={handleModeChange}
                onGenerate={generate}
                loading={loading}
                value={searchInput}
                onChange={setSearchInput}
              />

              {/* Profile Card */}
              <AnimatePresence mode="wait">
                {userProfile && (
                  <motion.div
                    key="profile-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  >
                    <UserProfileCard profile={userProfile} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tags */}
              <div className="tags-section">
                <h3 className="section-title">Vibe Tags</h3>
                <TagGroup
                  categories={tagCategories}
                  selectedTags={selectedTags}
                  onToggle={toggleTag}
                />
              </div>
            </div>
          </ScrollArea>


          {/* Result Modal Overlay */}
          <AnimatePresence>
            {(result || loading) && (
              <motion.div
                key="result-modal"
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !loading && setResult(null)}
              >
                <motion.div
                  className="modal-content"
                  initial={{ scale: 0.9, y: 50, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.95, y: 20, opacity: 0 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  onClick={e => e.stopPropagation()}
                >
                  {result && !loading && (
                    <div className="modal-close">
                      <Button variant="ghost" size="icon" onClick={() => setResult(null)} className="close-btn">
                        <span className="close-icon">×</span>
                      </Button>
                    </div>
                  )}
                  <div className="modal-body">
                    <ResultCard data={result} loading={loading} statusText={statusText} />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Queue Sidebar - Third Column with slide animation */}
        <AnimatePresence>
          {isQueueOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="queue-panel"
            >
              <QueueSidebar />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && !isDesktop && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mobile-sidebar-backdrop z-40"
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="mobile-sidebar-container z-50"
              >
                <div className="h-full flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="absolute top-4 right-4 z-50 text-foreground/80 hover:text-foreground hover:bg-white/10"
                  >
                    <span className="text-xl">×</span>
                  </Button>
                  {/* <div className="h-4"></div> */}
                  <PlaylistSidebar
                    className="flex-1"
                    refreshTrigger={refreshPlaylists}
                    onRefresh={() => setRefreshPlaylists(p => p + 1)}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Mobile Queue Overlay */}
        <AnimatePresence>
          {isQueueOpen && !isDesktop && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mobile-sidebar-backdrop z-40"
                onClick={() => setQueueOpen(false)}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="mobile-queue-container z-50"
              >
                <div className="h-full flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQueueOpen(false)}
                    className="absolute top-4 right-4 z-50 text-foreground/80 hover:text-foreground hover:bg-white/10"
                  >
                    <span className="text-xl">×</span>
                  </Button>
                  {/* <div className="h-4"></div> */}
                  <div className="flex-1 overflow-hidden">
                    <QueueSidebar />
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Global Player - Always visible at bottom, floating above content */}
      <div className="player-container">
        <div className="player-wrapper">
          <GlobalPlayer />
        </div>
      </div>
    </div>
  );
}

import { ToastProvider } from './components/ui/toast';

function App() {
  return (
    <AudioPlayerProvider>
      <QueuePanelProvider>
        <UserProfileProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </UserProfileProvider>
      </QueuePanelProvider>
    </AudioPlayerProvider>
  );
}

export default App;
