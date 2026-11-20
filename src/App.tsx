import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Contact } from '../shared/types';
import { BusinessToolsPanel } from './components/BusinessToolsPanel';
import { ChatListPanel } from './components/ChatListPanel';
import { ChatView } from './components/ChatView';
import { ContactInfoDrawer } from './components/ContactInfoDrawer';
import { LeftRail, type SidebarTab } from './components/LeftRail';
import { ImageLightbox, NewChatModal, NewGroupModal } from './components/Modals';
import { QaConsolePanel } from './components/QaConsolePanel';
import { SettingsPanel } from './components/SettingsPanel';
import { emulatorApi, useEmulatorState } from './services/api';

export default function App() {
  const { state, loading, error } = useEmulatorState();

  const [activeTab, setActiveTab] = useState<SidebarTab>('chats');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [rightDrawer, setRightDrawer] = useState<'info' | 'search' | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; caption?: string } | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wa-sim-theme') === 'dark';
    } catch {
      return false;
    }
  });

  // Sync `.dark` class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('wa-sim-theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage failure
    }
  }, [darkMode]);

  // Auto-select first active chat on initial load
  useEffect(() => {
    if (!state) return;
    if (!selectedChatId) {
      const firstActive = state.chats.find((c) => !c.archived) || state.chats[0];
      if (firstActive) setSelectedChatId(firstActive.id);
    } else if (!state.chats.some((c) => c.id === selectedChatId)) {
      const fallback = state.chats.find((c) => !c.archived) || state.chats[0] || null;
      setSelectedChatId(fallback ? fallback.id : null);
      setRightDrawer(null);
    }
  }, [state, selectedChatId]);

  // If variant switches to personal while Business Tools tab is open, return to chats
  useEffect(() => {
    if (state?.settings.variant === 'personal' && activeTab === 'business') {
      setActiveTab('chats');
    }
  }, [state?.settings.variant, activeTab]);

  const selectedChat = useMemo(
    () => state?.chats.find((c) => c.id === selectedChatId) || null,
    [state, selectedChatId]
  );

  const unreadTotal = useMemo(
    () =>
      (state?.chats || [])
        .filter((c) => !c.archived)
        .reduce((sum, c) => sum + c.unreadCount, 0),
    [state]
  );

  const archivedCount = useMemo(
    () => (state?.chats || []).filter((c) => c.archived).length,
    [state]
  );

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#111b21] text-[#54656f] dark:text-[#aebac1] gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin" />
        <p className="text-[14px] font-medium">Starting WA-Sim Emulator...</p>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#111b21] p-6 text-center gap-3">
        <p className="text-[16px] font-semibold text-[#111b21] dark:text-[#e9edef]">
          Unable to connect to WA-Sim backend
        </p>
        <p className="text-[13.5px] text-[#667781] dark:text-[#8696a0] max-w-md">
          {error || 'Backend server did not return initial state.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-[#00a884] text-white text-[13.5px] font-semibold inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setMobileShowChat(true);
    setHighlightedMessageId(null);
    const target = state.chats.find((c) => c.id === chatId);
    if (target && target.unreadCount > 0) {
      void emulatorApi.markChatRead(chatId);
    }
  };

  const handleSelectExistingContact = (contact: Contact) => {
    const existingChat = state.chats.find(
      (c) => c.type === 'direct' && c.contactId === contact.id
    );
    if (existingChat) {
      handleSelectChat(existingChat.id);
      setActiveTab('chats');
    } else {
      void emulatorApi
        .createContact({ name: contact.name, phone: contact.phone })
        .then(({ chat }) => {
          handleSelectChat(chat.id);
          setActiveTab('chats');
        });
    }
  };

  const handleToggleVariant = () => {
    const next = state.settings.variant === 'business' ? 'personal' : 'business';
    void emulatorApi.updateConfig({ variant: next });
  };

  return (
    <div
      className="h-screen w-screen overflow-hidden flex bg-[#f0f2f5] dark:bg-[#111b21] text-[#111b21] dark:text-[#e9edef]"
      data-variant={state.settings.variant}
    >
      {/* Left Navigation Rail */}
      <LeftRail
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setMobileShowChat(false);
        }}
        variant={state.settings.variant}
        onToggleVariant={handleToggleVariant}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        unreadTotal={unreadTotal}
        archivedCount={archivedCount}
        self={state.self}
      />

      {/* Left Sidebar View (hidden on mobile when a chat is actively opened) */}
      <div className={`${mobileShowChat ? 'hidden md:flex' : 'flex'} flex-1 md:flex-none h-full min-w-0`}>
        {(activeTab === 'chats' || activeTab === 'archived') && (
          <ChatListPanel
            mode={activeTab}
            variant={state.settings.variant}
            chats={state.chats}
            contacts={state.contacts}
            messagesByChat={state.messages}
            labels={state.labels}
            selectedChatId={selectedChatId}
            onSelectChat={handleSelectChat}
            onOpenArchive={() => setActiveTab('archived')}
            onBackFromArchive={() => setActiveTab('chats')}
            onOpenNewChat={() => setShowNewChat(true)}
            onOpenNewGroup={() => setShowNewGroup(true)}
            onUpdateChat={(chatId, patch) => void emulatorApi.updateChat(chatId, patch)}
          />
        )}

        {activeTab === 'business' && state.settings.variant === 'business' && (
          <BusinessToolsPanel
            profile={state.settings.businessProfile}
            automation={state.settings.businessAutomation}
            catalog={state.catalog}
            quickReplies={state.quickReplies}
            labels={state.labels}
            chats={state.chats}
            selectedChatId={selectedChatId}
            onUpdateProfile={async (patch) => {
              await emulatorApi.updateBusinessProfile(patch);
            }}
            onUpdateAutomation={async (patch) => {
              await emulatorApi.updateBusinessAutomation(patch);
            }}
            onSaveCatalogItem={async (item) => {
              await emulatorApi.upsertCatalogItem(item);
            }}
            onDeleteCatalogItem={async (id) => {
              await emulatorApi.deleteCatalogItem(id);
            }}
            onSendCatalogToChat={async (itemId) => {
              if (!selectedChatId) return;
              await emulatorApi.sendMessage({
                chatId: selectedChatId,
                body: '',
                type: 'catalog_item',
                catalogItemId: itemId,
              });
              setMobileShowChat(true);
            }}
            onSaveQuickReply={async (qr) => {
              await emulatorApi.upsertQuickReply(qr);
            }}
            onDeleteQuickReply={async (id) => {
              await emulatorApi.deleteQuickReply(id);
            }}
            onSaveLabel={async (lbl) => {
              await emulatorApi.upsertLabel(lbl);
            }}
            onDeleteLabel={async (id) => {
              await emulatorApi.deleteLabel(id);
            }}
          />
        )}

        {activeTab === 'qa' && (
          <QaConsolePanel
            contacts={state.contacts}
            chats={state.chats}
            selectedChatId={selectedChatId}
            autoReplyRules={state.autoReplyRules}
            webhookLogs={state.webhookLogs}
            settings={state.settings}
            onSimulateInbound={async (payload) => {
              const res = (await emulatorApi.receiveMessage({
                ...payload,
                media:
                  payload.type === 'voice'
                    ? {
                        id: `in-voice-${Date.now()}`,
                        url: '',
                        mimeType: 'audio/ogg',
                        durationSec: 9,
                        waveform: [18, 42, 68, 52, 85, 72, 46, 30, 62, 78, 54, 38, 25, 48, 66, 38, 22, 18],
                      }
                    : payload.type === 'image'
                      ? {
                          id: `in-img-${Date.now()}`,
                          url: '/src/assets/images/catalog_espresso_kit_1795189175804.jpg',
                          mimeType: 'image/jpeg',
                          filename: 'customer-photo.jpg',
                          caption: payload.body,
                        }
                      : payload.type === 'document'
                        ? {
                            id: `in-doc-${Date.now()}`,
                            url: '#',
                            mimeType: 'application/pdf',
                            filename: payload.body.endsWith('.pdf') ? payload.body : 'invoice-4821.pdf',
                            sizeBytes: 184200,
                          }
                        : undefined,
              })) as { chat?: { id: string } };
              if (res?.chat?.id) {
                setSelectedChatId(res.chat.id);
              }
            }}
            onSimulateTyping={async (chatId, isTyping, mode) => {
              await emulatorApi.setTyping(chatId, isTyping, mode);
            }}
            onSaveRule={async (rule) => {
              await emulatorApi.upsertAutoReplyRule(rule);
            }}
            onDeleteRule={async (id) => {
              await emulatorApi.deleteAutoReplyRule(id);
            }}
            onClearWebhookLogs={async () => {
              await emulatorApi.clearWebhookLogs();
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            self={state.self}
            settings={state.settings}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            onUpdateConfig={async (patch) => {
              await emulatorApi.updateConfig(patch);
            }}
            onResetState={async () => {
              await emulatorApi.reset(state.settings.variant);
            }}
          />
        )}
      </div>

      {/* Main Conversation Pane */}
      <div className={`${mobileShowChat ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 h-full`}>
        <ChatView
          chat={selectedChat}
          variant={state.settings.variant}
          self={state.self}
          contacts={state.contacts}
          messages={selectedChat ? state.messages[selectedChat.id] || [] : []}
          quickReplies={state.quickReplies}
          catalog={state.catalog}
          highlightedMessageId={highlightedMessageId}
          onBackMobile={() => setMobileShowChat(false)}
          onOpenInfo={() => setRightDrawer(rightDrawer === 'info' ? null : 'info')}
          onOpenSearch={() => setRightDrawer(rightDrawer === 'search' ? null : 'search')}
          onSendMessage={async (payload) => {
            await emulatorApi.sendMessage(payload);
          }}
          onUploadMedia={(payload) => emulatorApi.uploadMedia(payload)}
          onUpdateReceipt={async (messageId, status) => {
            await emulatorApi.updateReceipt(messageId, status);
          }}
          onPreviewImage={(url, caption) => setLightbox({ url, caption })}
        />

        {/* Right Info / Search Drawer */}
        {selectedChat && rightDrawer && (
          <ContactInfoDrawer
            mode={rightDrawer}
            chat={selectedChat}
            variant={state.settings.variant}
            contacts={state.contacts}
            messages={state.messages[selectedChat.id] || []}
            labels={state.labels}
            onClose={() => setRightDrawer(null)}
            onUpdateChat={(chatId, patch) => void emulatorApi.updateChat(chatId, patch)}
            onClearChat={(chatId) => void emulatorApi.clearChat(chatId)}
            onDeleteChat={(chatId) => {
              void emulatorApi.deleteChat(chatId);
              setRightDrawer(null);
            }}
            onHighlightMessage={(msgId) => setHighlightedMessageId(msgId)}
            onPreviewImage={(url, caption) => setLightbox({ url, caption })}
            onQuickSimulateTyping={(chatId, active) =>
              void emulatorApi.setTyping(chatId, active, 'typing')
            }
          />
        )}
      </div>

      {/* Modals */}
      {showNewChat && (
        <NewChatModal
          contacts={state.contacts}
          onClose={() => setShowNewChat(false)}
          onSelectExistingContact={handleSelectExistingContact}
          onCreateContact={async (input) => {
            const { chat } = await emulatorApi.createContact(input);
            handleSelectChat(chat.id);
            setActiveTab('chats');
          }}
        />
      )}

      {showNewGroup && (
        <NewGroupModal
          contacts={state.contacts}
          onClose={() => setShowNewGroup(false)}
          onCreateGroup={async (input) => {
            const { chat } = await emulatorApi.createGroup(input);
            handleSelectChat(chat.id);
            setActiveTab('chats');
          }}
        />
      )}

      {lightbox && (
        <ImageLightbox
          url={lightbox.url}
          caption={lightbox.caption}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
