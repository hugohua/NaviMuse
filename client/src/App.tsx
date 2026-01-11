import { useState, useEffect } from 'react';
import { AudioPlayerProvider } from './contexts/AudioPlayerContext';
import { QueuePanelProvider, useQueuePanel } from './contexts/QueuePanelContext';
import { GlobalPlayer } from './components/GlobalPlayer';
import { QueueSidebar } from './components/QueueSidebar';
import { ModeSwitcher } from './components/ModeSwitcher';
import { TagGroup } from './components/TagGroup';
import { ResultCard } from './components/ResultCard';
import { UserProfileCard } from './components/UserProfileCard';
import { PlaylistSidebar } from './components/PlaylistSidebar';
import type { DiscoveryMode, CuratorResponse, TagCategory, UserProfile } from './types';
import { api } from './api';
import { usePopup } from './contexts/PopupContext';
import { ScrollArea } from './components/ui/scroll-area';
import { Button } from './components/ui/button';
import { Sparkles, ArrowRight, Loader2, Menu, Sun, Moon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMediaQuery } from './hooks/use-media-query';
import { useTheme } from './hooks/use-theme';
import './App.css';

function AppContent() {
  const { showPopup } = usePopup();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const [mode, setMode] = useState<DiscoveryMode>('default');
  const [prompt, setPrompt] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Ready');
  const [result, setResult] = useState<CuratorResponse | null>(null);
  const [tagCategories, setTagCategories] = useState<TagCategory[]>([]);

  // User Profile State
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [analyzingProfile, setAnalyzingProfile] = useState(false);

  // Playlist list refresh trigger
  const [refreshPlaylists, setRefreshPlaylists] = useState(0);

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

    // Load User Profile
    const savedProfile = localStorage.getItem('navi_user_profile');
    if (savedProfile) {
      try {
        setUserProfile(JSON.parse(savedProfile));
      } catch (e) {
        console.error("Failed to parse saved profile", e);
        localStorage.removeItem('navi_user_profile');
      }
    }
  }, []);

  const handleAnalyzeProfile = async () => {
    if (analyzingProfile) return;
    setAnalyzingProfile(true);
    setStatusText("正在分析用户画像 (这可能需要几十秒)...");

    try {
      const profile = await api.analyzeUserProfile();
      setUserProfile(profile);
      localStorage.setItem('navi_user_profile', JSON.stringify(profile));
      showPopup({ message: `画像分析完成: ${profile.display_card.title}`, title: 'Success' });
      setStatusText("Ready");
    } catch (e: any) {
      showPopup({ message: '画像分析失败: ' + e.message, title: 'Error' });
      setStatusText("Error analyzing profile");
    } finally {
      setAnalyzingProfile(false);
    }
  };

  const toggleTag = (tag: string) => {
    const next = new Set(selectedTags);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    setSelectedTags(next);
  };

  const generate = async () => {
    const combinedPrompt = [prompt, ...Array.from(selectedTags)].filter(Boolean).join(', ');

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
  const { theme, toggleTheme } = useTheme();

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
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 text-foreground/80 hover:text-foreground hover:bg-white/10"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

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
                    className="w-12 h-12"
                  />
                  <h1 className="app-title">NaviMuse</h1>
                </div>
                <p className="app-subtitle">AI Music Curator</p>
              </header>

              {/* Controls */}
              <div className="controls-section">
                <div className="mode-section">
                  <ModeSwitcher current={mode} onChange={setMode} />
                </div>
                <Button
                  variant={analyzingProfile ? "secondary" : "default"}
                  onClick={handleAnalyzeProfile}
                  disabled={analyzingProfile}
                  className="analyze-btn"
                >
                  {analyzingProfile ? (
                    <>
                      <Loader2 className="btn-icon animate-spin" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="btn-icon" />
                      {userProfile ? '更新画像' : '生成画像'}
                    </>
                  )}
                </Button>
              </div>

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

          {/* Input Area - Floating Glass Bar */}
          <div className="input-area">
            <div className="input-bar">
              <input
                type="text"
                className="prompt-input"
                placeholder="描述当下的心情... (例如：下雨天的爵士乐)"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generate()}
              />
              <Button
                size="icon"
                className="send-btn"
                onClick={generate}
                disabled={loading}
              >
                {loading ? <Loader2 className="send-icon animate-spin" /> : <ArrowRight className="send-icon" />}
              </Button>
            </div>
          </div>

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

function App() {
  return (
    <AudioPlayerProvider>
      <QueuePanelProvider>
        <AppContent />
      </QueuePanelProvider>
    </AudioPlayerProvider>
  );
}

export default App;
