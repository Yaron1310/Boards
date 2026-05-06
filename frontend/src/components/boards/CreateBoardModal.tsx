import React, { useState, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiX, FiLayout, FiSearch } from 'react-icons/fi';
import { useCreateBoard } from '../../hooks/queries/useBoardQueries';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// Full emoji library organised by category
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  },
  {
    label: 'People',
    emojis: ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁','👅','👄','🫦','💋'],
  },
  {
    label: 'Animals',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🦆','🐧','🐦','🐤','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐈‍⬛','🐓','🦃'],
  },
  {
    label: 'Food',
    emojis: ['🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🫑','🥦','🥬','🥒','🌶','🫒','🧄','🧅','🥔','🌽','🥕','🫛','🧆','🥜','🫘','🌰','🍞','🥐','🥖','🫓','🥨','🥯','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🫙','🥗','🥘','🍲','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍙','🍚','🍱','🥟','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻'],
  },
  {
    label: 'Travel',
    emojis: ['🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣','🛤','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🚤','🛥','🛳','⛴','🚢','✈','🛩','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰','🚀','🛸','🎡','🎢','🎠','🏗','🌁','🗼','🗽','⛪','🕌','🛕','🕍','⛩','🕋','⛲','⛺','🏕','🏖','🏜','🏝','🏞','🏟','🏛','🏗','🧱','🏘','🏚','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗾','🎑','⛰','🌋','🗻','🏔','🗺'],
  },
  {
    label: 'Activities',
    emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸','🥌','🎿','⛷','🏂','🪂','🏋','🤼','🤸','⛹','🤺','🤾','🏌','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖','🏵','🎗','🎫','🎟','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🪈','🎲','♟','🎯','🎳','🎮','🎰','🧩'],
  },
  {
    label: 'Objects',
    emojis: ['⌚','📱','💻','⌨','🖥','🖨','🖱','🖲','💾','💿','📀','🧮','📷','📸','📹','🎥','📞','☎','📟','📠','📺','📻','🎙','🎚','🎛','🧭','⏱','⏲','⏰','🕰','⌛','⏳','📡','🔋','🪫','🔌','💡','🔦','🕯','🪔','🗑','🛢','💸','💵','💳','🪙','💎','⚖','🪜','🧰','🔧','🔨','⚒','🛠','⛏','🪛','🔩','⚙','🗜','🔗','⛓','🪝','🧲','🔫','💣','🪓','🔪','🗡','⚔','🛡','🪚','🔬','🔭','🩺','💊','🩹','🩼','💉','🩸','🧬','🦠','🧫','🧪','🌡','🧹','🪣','🧺','🧻','🪠','🧼','🫧','🪥','🧽','🧯','🛒','🚪','🪞','🪟','🛏','🛋','🪑','🚽','🪠','🚿','🛁','🪤','🧴','🧷','🧹','🧺'],
  },
  {
    label: 'Symbols',
    emojis: ['❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','☮','✝','☪','🕉','☸','✡','🔯','🕎','☯','☦','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛','🉑','☢','☣','📴','📳','🈶','🈚','🈸','🈺','🈷','✴','🆚','💮','🉐','㊙','㊗','🈴','🈵','🈹','🈲','🅰','🅱','🆎','🆑','🅾','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','❗','❕','❓','❔','‼','⁉','🔅','🔆','〽','⚠','🚸','🔱','⚜','🔰','♻','✅','🈯','💹','❎','🌐','💠','Ⓜ','🌀','💤','🏧','🚾','♿','🅿','🛗','🈳','🈂','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧','🚻','🚮','🎦','📶','🈁','🔣','ℹ','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','⏏','▶','⏸','⏹','⏺','⏭','⏮','⏩','⏪','⏫','⏬','◀','🔼','🔽','➡','⬅','⬆','⬇','↗','↘','↙','↖','↕','↔','↩','↪','⤴','⤵','🔀','🔁','🔂','🔃','🎵','🎶','➕','➖','➗','✖','♾','💲','💱','™','©','®','〰','➰','➿','🔚','🔙','🔛','🔝','🔜','✔','☑','🔘','🔲','🔳','▪','▫','◾','◽','◼','◻','⬛','⬜','🟥','🟧','🟨','🟩','🟦','🟪','🟫','⚫','⚪','🔴','🟠','🟡','🟢','🔵','🟣','🟤'],
  },
  {
    label: 'Nature',
    emojis: ['🌸','💮','🏵','🌹','🥀','🌺','🌻','🌼','🌷','🌱','🪴','🌲','🌳','🌴','🌵','🎋','🎍','🍀','☘','🍁','🍂','🍃','🪹','🪺','🍄','🌾','💐','🌿','🪸','🪨','🌊','🌬','🌀','🌈','☀','🌤','⛅','🌦','🌧','⛈','🌩','🌨','❄','☃','⛄','🌬','🌊','🌁','🌫','🌌','🌠','⛰','🌋','🗻','🏔','🌅','🌄','🌇','🌆','🏙','🌃','🌉','🌌','🌃','🌁'],
  },
  {
    label: 'Work & Business',
    emojis: ['📋','📊','📈','📉','📌','📍','📎','🖇','📏','📐','✂','🗃','🗄','🗑','📁','📂','🗂','📄','📃','📑','🗒','🗓','📅','📆','📇','📈','📉','📊','📋','📌','📍','✏','✒','🖊','🖋','📝','💼','🎒','🧳','👜','👛','👝','🎓','🏫','🏢','🏣','🏤','🏥','🏦','💡','🔍','🔎','🔏','🔐','🔑','🗝','🔓','🔒','⚙','🛠','🔧','🔨','🪛','📡','📞','☎','📟','📠','💻','🖥','⌨','🖱','🖲','📱','📲','📷','📸','📹','🎥','📽','🎞','📞','🔋','💾','💿','📀'],
  },
];

interface CreateBoardModalProps {
  workspaceId?: string;
  onClose: () => void;
}

const CreateBoardModal: React.FC<CreateBoardModalProps> = ({ workspaceId, onClose }) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [emojiSearch, setEmojiSearch] = useState('');
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const { mutateAsync: createBoard, isPending } = useCreateBoard();

  const effectiveWorkspaceId = workspaceId ?? '';

  const filteredCategories = useMemo(() => {
    const q = emojiSearch.trim().toLowerCase();
    if (!q) return EMOJI_CATEGORIES;
    return EMOJI_CATEGORIES
      .map((cat) => ({
        ...cat,
        emojis: cat.emojis.filter(() => cat.label.toLowerCase().includes(q)),
      }))
      .filter((cat) => {
        // Also search by returning all emojis in matching categories
        const labelMatch = cat.label.toLowerCase().includes(q);
        return labelMatch && cat.emojis.length > 0;
      });
  }, [emojiSearch]);

  // Simple emoji search: flatten all emojis if the query looks like an emoji keyword
  const searchResults = useMemo(() => {
    const q = emojiSearch.trim().toLowerCase();
    if (!q) return null;
    const matched: string[] = [];
    EMOJI_CATEGORIES.forEach((cat) => {
      if (cat.label.toLowerCase().includes(q)) {
        matched.push(...cat.emojis);
      }
    });
    return matched.length > 0 ? matched : null;
  }, [emojiSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Board name is required.');
      return;
    }
    if (!effectiveWorkspaceId) {
      setError('No WorkHub selected. Please navigate into a WorkHub first.');
      return;
    }
    setError('');
    try {
      const finalName = selectedEmoji ? `${selectedEmoji} ${trimmed}` : trimmed;
      const board = await createBoard({
        name: finalName,
        description: description.trim() || undefined,
        workspaceId: effectiveWorkspaceId,
      });
      onClose();
      navigate(`/boards/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board.');
    }
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  const displayCategories = searchResults
    ? [{ label: 'Results', emojis: searchResults }]
    : EMOJI_CATEGORIES;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-board-title"
    >
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FiLayout className="text-indigo-600" size={16} aria-hidden="true" />
            </div>
            <h2 id="create-board-title" className="text-lg font-semibold text-gray-800">
              New Board
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-md p-1"
            aria-label="Close dialog"
            data-modal-escape
          >
            <FiX size={20} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0 flex-1">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {/* Emoji picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Icon
                {selectedEmoji && (
                  <span className="ml-2 text-lg">{selectedEmoji}</span>
                )}
              </label>

              {/* Search */}
              <div className="relative mb-2">
                <FiSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  type="text"
                  value={emojiSearch}
                  onChange={(e) => setEmojiSearch(e.target.value)}
                  placeholder="Search categories…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Search emojis"
                />
              </div>

              {/* Emoji grid */}
              <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: '220px' }}>
                <div className="p-2">
                  {/* None option */}
                  <button
                    type="button"
                    onClick={() => setSelectedEmoji('')}
                    className={`mb-2 px-2 py-1 rounded text-sm transition-all ${!selectedEmoji ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    aria-label="No emoji"
                  >
                    None
                  </button>

                  {displayCategories.map((cat) => (
                    <div key={cat.label} className="mb-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1">{cat.label}</p>
                      <div className="flex flex-wrap gap-0.5">
                        {cat.emojis.map((emoji, idx) => (
                          <button
                            key={`${emoji}-${idx}`}
                            type="button"
                            onClick={() => setSelectedEmoji(emoji)}
                            className={`text-xl w-9 h-9 rounded transition-all flex items-center justify-center ${selectedEmoji === emoji ? 'bg-indigo-100 ring-2 ring-indigo-500' : 'hover:bg-gray-100'}`}
                            aria-label={`Select ${emoji}`}
                            title={emoji}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {displayCategories.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No emojis found.</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="board-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              <input
                id="board-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q3 Roadmap"
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                aria-required="true"
                aria-describedby={error ? 'board-error' : undefined}
              />
            </div>

            <div>
              <label htmlFor="board-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="board-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — describe the board's purpose"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p id="board-error" className="text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              aria-label="Cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !effectiveWorkspaceId}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
              aria-label="Create board"
            >
              {isPending ? 'Creating…' : 'Create Board'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    modalRoot
  );
};

export default CreateBoardModal;
