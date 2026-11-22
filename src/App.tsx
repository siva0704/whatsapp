import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Contact } from '../shared/types';
import { AutomationsPanel } from './components/AutomationsPanel';
import { BroadcastsPanel } from './components/BroadcastsPanel';
import { BusinessToolsPanel } from './components/BusinessToolsPanel';
import { ChatListPanel } from './components/ChatListPanel';
import { ChatView } from './components/ChatView';
import { ClientsPanel } from './components/ClientsPanel';
import { ContactInfoDrawer } from './components/ContactInfoDrawer';
import { LeftRail, type SidebarTab } from './components/LeftRail';
import { MobileBottomNav } from './components/MobileBottomNav';
import { CallsPanel, UpdatesPanel } from './components/MobileSecondaryViews';
import {
  ImageLightbox,
  NewChatModal,
  NewGroupModal,
  SendRichMessageModal,
  SendTemplateModal,
} from './components/Modals';
import { QaConsolePanel } from './components/QaConsolePanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
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
  const [templateModalState, setTemplateModalState] = useState<{
    open: boolean;
    initialTemplateId?: string;
  }>({ open: false });
  const [showRichModal, setShowRichModal] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; caption?: string } | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wa-sim-theme') === 'dark';
    } catch {
      return false;
    }
  });

  const [perspective, setPerspective] = useState<'client' | 'business'>(() => {
    try {
      const saved = localStorage.getItem('wa_sim_perspective');
      if (saved === 'client' || saved === 'business') return saved;
    } catch {}
    return 'client';
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

  // If variant switches to personal while Business-only tab is open, return to chats
  useEffect(() => {
    if (
      state?.settings.variant === 'personal' &&
      (activeTab === 'business' ||
        activeTab === 'clients' ||
        activeTab === 'broadcasts' ||
        activeTab === 'automations')
    ) {
      setActiveTab('chats');
    }
    if (state?.settings.variant === 'business' && activeTab === 'calls') {
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

  const clientCount = useMemo(
    () => (state?.contacts || []).filter((c) => !c.isBot).length,
    [state]
  );

  const runningBroadcastsCount = useMemo(
    () =>
      (state?.broadcasts || []).filter(
        (b) => b.status === 'running' || b.status === 'scheduled'
      ).length,
    [state]
  );

  const isFullWidthTab =
    state?.settings.variant === 'business' &&
    (activeTab === 'clients' || activeTab === 'broadcasts' || activeTab === 'automations');

  if (loading) {
    return (
      <div className="h-[100dvh] w-screen flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#111b21] text-[#54656f] dark:text-[#aebac1] gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-[#00a884] border-t-transparent animate-spin" />
        <p className="text-[14px] font-medium">Starting WA-Sim Emulator...</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="h-[100dvh] w-screen flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#111b21] p-6 text-center gap-3">
        <p className="text-[16px] font-semibold text-[#111b21] dark:text-[#e9edef]">
          Loading WA-Sim Protocol Environment...
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-[#00a884] text-white text-[13.5px] font-semibold inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Reload
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

  const handleOpenContactChatById = (contactId: string) => {
    const ct = state.contacts.find((c) => c.id === contactId);
    if (ct) handleSelectExistingContact(ct);
  };

  const handleTogglePerspective = () => {
    setPerspective((prev) => {
      const next = prev === 'client' ? 'business' : 'client';
      try {
        localStorage.setItem('wa_sim_perspective', next);
      } catch {}
      return next;
    });
  };

  const handleToggleVariant = () => {
    const next = state.settings.variant === 'business' ? 'personal' : 'business';
    void emulatorApi.updateConfig({ variant: next });
    const nextPerspective = next === 'personal' ? 'client' : 'business';
    setPerspective(nextPerspective);
    try {
      localStorage.setItem('wa_sim_perspective', nextPerspective);
    } catch {}
  };

  return (
    <div
      className="h-[100dvh] w-screen overflow-hidden flex flex-col md:flex-row bg-[#f0f2f5] dark:bg-[#111b21] text-[#111b21] dark:text-[#e9edef]"
      data-variant={state.settings.variant}
    >
      {/* Desktop Left Navigation Rail */}
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
        clientCount={clientCount}
        runningBroadcastsCount={runningBroadcastsCount}
        self={state.self}
      />

      {/* Full-Width Single-Sender Console Screens (Clients, Broadcasts, Automations) */}
      {isFullWidthTab && (
        <div className="flex-1 min-w-0 min-h-0 flex">
          {activeTab === 'clients' && (
            <ClientsPanel
              contacts={state?.contacts || []}
              onBulkSeed={(req) => emulatorApi.bulkSeedClients(req)}
              onOpenChat={handleSelectExistingContact}
              onUpdateContact={async (contactId, patch) => {
                await emulatorApi.updateContact(contactId, patch);
              }}
              onSetOptIn={async (contactId, status) => {
                await emulatorApi.setContactOptIn(contactId, status, 'ui');
              }}
              onSimulateResponse={async (req) => {
                await emulatorApi.simulateClientResponse(req);
              }}
            />
          )}

          {activeTab === 'broadcasts' && (
            <BroadcastsPanel
              broadcasts={state?.broadcasts || []}
              contacts={state.contacts}
              templates={state?.templates || []}
              phoneNumbers={state?.phoneNumbers || []}
              activePhoneNumberId={state.settings.activePhoneNumberId}
              onCreateBroadcast={async (req) => {
                const res =
                  req.delaySeconds && req.delaySeconds > 0
                    ? await emulatorApi.scheduleBroadcast(req)
                    : await emulatorApi.createBroadcast(req);
                return res.broadcast;
              }}
              onDispatchBroadcastNow={async (id) => {
                await emulatorApi.dispatchBroadcastNow(id);
              }}
              onOpenChatByContactId={handleOpenContactChatById}
            />
          )}

          {activeTab === 'automations' && (
            <AutomationsPanel
              automation={state.settings.businessAutomation}
              autoReplyRules={state?.autoReplyRules || []}
              contacts={state.contacts}
              failureInjection={state.failureInjection}
              rateLimits={state.rateLimits}
              rateLimitUsage={state.rateLimitUsage}
              onUpdateAutomation={async (patch) => {
                await emulatorApi.updateBusinessAutomation(patch);
              }}
              onSaveRule={async (rule) => {
                await emulatorApi.upsertAutoReplyRule(rule);
              }}
              onDeleteRule={async (id) => {
                await emulatorApi.deleteAutoReplyRule(id);
              }}
              onUpdateFailureInjection={async (patch) => {
                await emulatorApi.updateFailureInjection(patch);
              }}
              onUpdateRateLimits={async (patch) => {
                await emulatorApi.updateRateLimits(patch);
              }}
              onResetRateLimits={async () => {
                await emulatorApi.resetRateLimits();
              }}
            />
          )}
        </div>
      )}

      {/* Left Sidebar View (full-width on mobile when chat isn't open) */}
      {!isFullWidthTab && (
        <div
          className={`${
            mobileShowChat ? 'hidden md:flex' : 'flex'
          } flex-1 md:flex-none min-h-0 md:h-full min-w-0`}
        >
          {(activeTab === 'chats' || activeTab === 'archived') && (
            <ChatListPanel
              mode={activeTab}
              variant={state.settings.variant}
              perspective={perspective}
              enforce24hWindow={state.settings.enforce24hWindow}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
              onToggleVariant={handleToggleVariant}
              phoneNumbers={state.phoneNumbers}
              activePhoneNumberId={state.settings.activePhoneNumberId}
              onSelectPhoneNumber={(id) => void emulatorApi.updateConfig({ activePhoneNumberId: id })}
              chats={state.chats}
              contacts={state.contacts}
              messagesByChat={state.messages}
              labels={state?.labels || []}
              selectedChatId={selectedChatId}
              onSelectChat={handleSelectChat}
              onOpenArchive={() => setActiveTab('archived')}
              onBackFromArchive={() => setActiveTab('chats')}
              onOpenNewChat={() => setShowNewChat(true)}
              onOpenNewGroup={() => setShowNewGroup(true)}
              onOpenBusinessTools={() => {
                setActiveTab('business');
                setMobileShowChat(false);
              }}
              onOpenSettings={() => {
                setActiveTab('settings');
                setMobileShowChat(false);
              }}
              onUpdateChat={(chatId, patch) => void emulatorApi.updateChat(chatId, patch)}
            />
          )}

        {activeTab === 'updates' && (
          <UpdatesPanel
            updates={state.statusUpdates}
            onPreviewImage={(url, caption) => setLightbox({ url, caption })}
          />
        )}

        {activeTab === 'calls' && (
          <CallsPanel
            calls={state.callLogs}
            onOpenContactChat={handleOpenContactChatById}
          />
        )}

        {activeTab === 'business' && state.settings.variant === 'business' && (
          <BusinessToolsPanel
            profile={state.settings.businessProfile}
            automation={state.settings.businessAutomation}
            catalog={state?.catalog || []}
            quickReplies={state?.quickReplies || []}
            labels={state.labels}
            templates={state.templates}
            phoneNumbers={state.phoneNumbers}
            activePhoneNumberId={state.settings.activePhoneNumberId}
            contacts={state.contacts}
            conversations={state?.conversations || []}
            pricingRatesUsd={state.settings.pricingRatesUsd}
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
            onSaveTemplate={async (tpl) => {
              await emulatorApi.upsertTemplate(tpl);
            }}
            onSetTemplateStatus={async (id, status) => {
              await emulatorApi.setTemplateStatus(id, status);
            }}
            onDeleteTemplate={async (id) => {
              await emulatorApi.deleteTemplate(id);
            }}
            onOpenSendTemplateModal={(templateId) => {
              setTemplateModalState({ open: true, initialTemplateId: templateId });
            }}
            onSetContactOptIn={async (contactId, status) => {
              await emulatorApi.setContactOptIn(contactId, status, 'ui');
            }}
            onSelectActivePhoneNumber={async (id) => {
              await emulatorApi.updateConfig({ activePhoneNumberId: id });
            }}
            onUpsertPhoneNumber={async (input) => {
              await emulatorApi.upsertPhoneNumber(input);
            }}
          />
        )}

        {activeTab === 'qa' && (
          <QaConsolePanel
            contacts={state.contacts}
            chats={state.chats}
            templates={state.templates}
            phoneNumbers={state.phoneNumbers}
            selectedChatId={selectedChatId}
            autoReplyRules={state.autoReplyRules}
            webhookLogs={state?.webhookLogs || []}
            settings={state.settings}
            onSelectChat={(chatId) => setSelectedChatId(chatId)}
            onSwitchVariant={async (variant) => {
              await emulatorApi.updateConfig({ variant });
            }}
            onSimulateInbound={async (payload) => {
              const res = await emulatorApi.receiveMessage({
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
                      : payload.type === 'video'
                        ? {
                            id: `in-vid-${Date.now()}`,
                            url: '',
                            mimeType: 'video/mp4',
                            filename: 'customer-clip.mp4',
                            durationSec: 12,
                          }
                        : payload.type === 'document'
                          ? {
                              id: `in-doc-${Date.now()}`,
                              url: '#',
                              mimeType: 'application/pdf',
                              filename: payload.body?.endsWith('.pdf')
                                ? payload.body
                                : 'invoice-4821.pdf',
                              sizeBytes: 184200,
                            }
                          : undefined,
              });
              if (res?.chat?.id) {
                setSelectedChatId(res.chat.id);
              }
            }}
            onSendMessage={async (payload) => {
              await emulatorApi.sendMessage(payload);
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
            onOpenTab={(tab) => {
              setActiveTab(tab);
              setMobileShowChat(false);
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            self={state.self}
            settings={state.settings}
            phoneNumbers={state.phoneNumbers}
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
      )}

      {/* Main Conversation Pane (full-screen on mobile when chat is opened) */}
      {!isFullWidthTab && (
        <div
          className={`${
            mobileShowChat ? 'flex' : 'hidden md:flex'
          } flex-1 min-w-0 min-h-0 md:h-full`}
        >
        <ErrorBoundary key={selectedChat?.id || 'none'}>
          <ChatView
            chat={selectedChat}
            variant={state.settings.variant}
            perspective={perspective}
            onTogglePerspective={handleTogglePerspective}
            enforce24hWindow={state.settings.enforce24hWindow}
            self={state.self}
            contacts={state.contacts}
            messages={selectedChat ? (state?.messages && state.messages[selectedChat.id]) || [] : []}
            quickReplies={state.quickReplies}
            catalog={state.catalog}
            highlightedMessageId={highlightedMessageId}
            onBackMobile={() => {
              setMobileShowChat(false);
              setRightDrawer(null);
            }}
            onOpenInfo={() => setRightDrawer(rightDrawer === 'info' ? null : 'info')}
            onOpenSearch={() => setRightDrawer(rightDrawer === 'search' ? null : 'search')}
            onOpenTemplateModal={() => setTemplateModalState({ open: true })}
            onOpenRichModal={() => setShowRichModal(true)}
            onSendMessage={async (payload) => {
              await emulatorApi.sendMessage(payload);
            }}
            onSendAsClient={async ({ chatId, body, type, replyToMessageId }) => {
              const targetChat = state.chats.find((c) => c.id === chatId);
              const ct = targetChat?.contactId
                ? state.contacts.find((c) => c.id === targetChat.contactId)
                : undefined;
              await emulatorApi.receiveMessage({
                chatId,
                senderId: ct?.id,
                fromPhone: ct?.phone,
                fromName: ct?.name,
                type: type || 'text',
                body,
                replyToMessageId,
              });
            }}
            onSimulateInteractiveReply={async ({ chatId, selectedId, selectedTitle, kind }) => {
              const targetChat = state.chats.find((c) => c.id === chatId);
              const ct = targetChat?.contactId
                ? state.contacts.find((c) => c.id === targetChat.contactId)
                : undefined;
              await emulatorApi.receiveMessage({
                chatId,
                senderId: ct?.id,
                fromPhone: ct?.phone,
                fromName: ct?.name,
                type: 'interactive',
                body: selectedTitle,
                interactive: {
                  kind,
                  bodyText: selectedTitle,
                  selectedId,
                  selectedTitle,
                },
              });
            }}
            onUploadMedia={(payload) => emulatorApi.uploadMedia(payload)}
            onUpdateReceipt={async (messageId, status, errorCode) => {
              await emulatorApi.updateReceipt(messageId, status, errorCode);
            }}
            onPreviewImage={(url, caption) => setLightbox({ url, caption })}
          />
        </ErrorBoundary>

        {/* Right Info / Search Drawer */}
        {selectedChat && rightDrawer && (
          <ContactInfoDrawer
            mode={rightDrawer}
            chat={selectedChat}
            variant={state.settings.variant}
            contacts={state.contacts}
            messages={(state?.messages && selectedChat && state.messages[selectedChat.id]) || []}
            labels={state.labels}
            onClose={() => setRightDrawer(null)}
            onUpdateChat={(chatId, patch) => void emulatorApi.updateChat(chatId, patch)}
            onBlockContact={async (contactId, blocked) => {
              await emulatorApi.blockContact(contactId, blocked);
            }}
            onSetContactOptIn={async (contactId, status) => {
              await emulatorApi.setContactOptIn(contactId, status, 'ui');
            }}
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
      )}

      {/* Mobile Bottom Tab Navigation (hidden when viewing a full-screen chat thread) */}
      {!mobileShowChat && (
        <MobileBottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setMobileShowChat(false);
            setRightDrawer(null);
          }}
          variant={state.settings.variant}
          unreadTotal={unreadTotal}
        />
      )}

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

      {templateModalState.open && selectedChat && (
        <SendTemplateModal
          templates={state.templates}
          initialTemplateId={templateModalState.initialTemplateId}
          chatName={selectedChat.name}
          onClose={() => setTemplateModalState({ open: false })}
          onSendTemplate={async ({ templateId, variables, otpCode }) => {
            await emulatorApi.sendMessage({
              chatId: selectedChat.id,
              type: 'template',
              templateId,
              templateVariables: variables,
              templateOtpCode: otpCode,
            });
            setMobileShowChat(true);
          }}
        />
      )}

      {showRichModal && selectedChat && (
        <SendRichMessageModal
          chatName={selectedChat.name}
          onClose={() => setShowRichModal(false)}
          onSendRich={async (payload) => {
            await emulatorApi.sendMessage({
              chatId: selectedChat.id,
              ...payload,
            });
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
