import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import type { User } from '../../types';
import { UserRole } from '../../types';
import { FiEdit3, FiSave, FiCamera, FiKey, FiX, FiCheckCircle, FiAlertCircle, FiUploadCloud, FiTrash2, FiLoader, FiAlertTriangle, FiLogOut, FiUserMinus, FiRepeat, FiCpu, FiArrowLeft, FiLink, FiEye, FiEyeOff, FiGlobe } from 'react-icons/fi';
import i18n, { SUPPORTED_LANGUAGES } from '../../i18n';
import { useTranslation } from 'react-i18next';

const ProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const {
    user: authUser, 
    updateUserDetails, 
    updateUserPassword, 
    updateUserProfileImage, 
    loading: authLoading, 
    authError, 
    clearAuthError,
    logout,
    startContextSwitch,
    availableContexts,
    selectedWorkspace,
  } = useAuth();
  const {
    users,
    deleteUser,
    removeUserFromWorkspace,
    dataError: dataCtxError,
    clearDataError: clearDataCtxError,
    isLoading: dataCtxLoading,
  } = useData();
  const { userId: routeUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [editedImageUrl, setEditedImageUrl] = useState('');
  const [imageUploadFile, setImageUploadFile] = useState<File | null>(null);
  const [compressedImageBlob, setCompressedImageBlob] = useState<Blob | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Language Settings State
  const [isLanguageSettingsOpen, setIsLanguageSettingsOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => authUser?.preferredLanguage || i18n.language.split('-')[0] || 'en');
  const [isLanguageSaving, setIsLanguageSaving] = useState(false);

  const [profileUpdateMessage, setProfileUpdateMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  useEffect(() => {
    if (profileUpdateMessage) {
      const timer = setTimeout(() => {
        setProfileUpdateMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [profileUpdateMessage]);
  
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showRemoveUserConfirmModal, setShowRemoveUserConfirmModal] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [deletionType, setDeletionType] = useState<'soft' | 'hard' | null>(null);

  const isOwnProfile = useMemo(() => !routeUserId || authUser?.id === routeUserId, [routeUserId, authUser]);

  const canSwitchContexts = useMemo(() => {
    if (!authUser) return false;
    return availableContexts.flatMap(g => g.contexts).length > 1;
  }, [authUser, availableContexts]);



  useEffect(() => {
    // Determine the user to display based on the route.
    const userToDisplay = routeUserId
      ? users.find((u) => u.id === routeUserId)
      : authUser;
  
    // Authorization check for WorkHub Admins viewing another user's profile.
    if (
      authUser?.role === UserRole.WORKSPACE_ADMIN &&
      userToDisplay &&
      userToDisplay.id !== authUser.id
    ) {
      const adminOrgId = selectedWorkspace?.id;
      // An org admin can only view users who are part of their workspace.
      const isUserInAdminsOrg = userToDisplay.workspaces.some(org => org.id === adminOrgId);
      if (!isUserInAdminsOrg) {
        navigate('/admin/users', { replace: true });
        return;
      }
    }
  
    if (userToDisplay) {
      setProfileUser(userToDisplay as User);
      setEditedName((userToDisplay as User).name);
      setEditedImageUrl((userToDisplay as User).profileImageUrl || '');
      
      // Load language preference if own profile
      if (isOwnProfile && authUser) {
          if (authUser.preferredLanguage) {
              setSelectedLanguage(authUser.preferredLanguage);
          }
      }
    } else if (!authLoading && !dataCtxLoading) {
      // Handle cases where the user isn't found or isn't logged in.
      if (routeUserId) {
        // A specific user was requested but not found in the context.
        navigate('/admin/users', { replace: true });
      } else {
        // The user is trying to access their own profile but is not logged in.
        navigate('/login');
      }
    }
    // If still loading, we do nothing and let the effect re-run when data is ready.
  }, [authUser, routeUserId, users, navigate, authLoading, dataCtxLoading, selectedWorkspace, isOwnProfile]);
  
  useEffect(() => { 
    const generalError = authError || dataCtxError;
    if(generalError && !profileUpdateMessage?.text.includes(generalError)) { 
        setProfileUpdateMessage({ type: 'error', text: generalError });
    }
  }, [authError, dataCtxError, profileUpdateMessage]);
  


  const clearMessages = () => {
    setProfileUpdateMessage(null);
    if (authError) clearAuthError();
    if (dataCtxError) clearDataCtxError();
  }

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const MAX_DIMENSION = 400; // px — sufficient for a profile picture
      const QUALITY = 0.75;

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height / width) * MAX_DIMENSION);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width / height) * MAX_DIMENSION);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) reject(new Error('Failed to compress image'));
          else resolve(blob);
        }, 'image/webp', QUALITY);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };

      img.src = objectUrl;
    });
  };

  const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    clearMessages();

    const MAX_RAW_SIZE = 10 * 1024 * 1024; // 10MB — reject absurdly large files before compression
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    if (file.size > MAX_RAW_SIZE) {
      setProfileUpdateMessage({ type: 'error', text: t('profile.fileTooLarge') });
      event.target.value = '';
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setProfileUpdateMessage({ type: 'error', text: t('profile.invalidFileType') });
      event.target.value = '';
      return;
    }

    setImageUploadFile(file);
    setEditedImageUrl('');
    setShowUrlInput(false);

    compressImage(file)
      .then((blob) => {
        setCompressedImageBlob(blob);
        setImagePreviewUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        setProfileUpdateMessage({ type: 'error', text: 'Failed to process image. Please try another file.' });
        event.target.value = '';
      });
  };

  const handleSaveDetails = async () => {
    clearMessages();
    if (!editedName.trim()) {
        setProfileUpdateMessage({type: 'error', text: "Name cannot be empty."});
        return;
    }
    const success = await updateUserDetails({ name: editedName });
    if (success) {
        setProfileUpdateMessage({type: 'success', text: "Details updated successfully."});
        setIsEditingDetails(false);
    } else {
        if (!authError && !dataCtxError) setProfileUpdateMessage({type: 'error', text: "Failed to update details."});
    }
  };

  const handleChangePassword = async () => {
    clearMessages();
    if (newPassword !== confirmNewPassword) {
      setProfileUpdateMessage({ type: 'error', text: "New passwords do not match." });
      return;
    }

    const isPasswordValid = newPassword.length >= 8 && /^[!-~]+$/.test(newPassword) && /\d/.test(newPassword) && /[!@#$%^&*]/.test(newPassword);
    if (!isPasswordValid) {
        setProfileUpdateMessage({ type: 'error', text: "Latin characters only (English letters, numbers, and symbols). Password must be at least 8 characters long and contain at least one digit and one special character." });
        return;
    }

    const payload: { newPassword: string, currentPassword?: string } = { newPassword };
    if (authUser?.hasPassword) {
        if (!currentPassword) {
            setProfileUpdateMessage({type: 'error', text: "Current password is required."});
            return;
        }
        payload.currentPassword = currentPassword;
    }

    const success = await updateUserPassword(payload);

    if (success) {
      setProfileUpdateMessage({ type: 'success', text: `Password ${authUser?.hasPassword ? 'changed' : 'created'} successfully.` });
      setIsChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
    // Error is handled by AuthContext
  };


  const handleSaveImage = async () => {
    clearMessages();

    if (compressedImageBlob) {
        // Upload the compressed image blob
        const success = await updateUserProfileImage(compressedImageBlob);
        if (success) {
            setProfileUpdateMessage({type: 'success', text: "Profile image updated."});
            setIsEditingImage(false);
            setImageUploadFile(null);
            setCompressedImageBlob(null);
            if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
            setImagePreviewUrl(null);
        } else {
             if (!authError && !dataCtxError) setProfileUpdateMessage({type: 'error', text: "Failed to update profile image."});
        }
    } else if (editedImageUrl.trim()) {
        const url = editedImageUrl.trim();
        // Validate HTTPS URL
        if (showUrlInput && !url.startsWith('http') && !url.startsWith('https')) {
             setProfileUpdateMessage({type: 'error', text: "Please enter a valid image URL starting with http."});
             return;
        }
        const success = await updateUserProfileImage(url);
        if (success) {
            setProfileUpdateMessage({type: 'success', text: "Profile image updated."});
            setIsEditingImage(false);
        } else {
             if (!authError && !dataCtxError) setProfileUpdateMessage({type: 'error', text: "Failed to update profile image."});
        }
    } else {
        // Remove profile image
        const success = await updateUserProfileImage('');
        if (success) {
            setProfileUpdateMessage({type: 'success', text: "Profile image removed."});
            setIsEditingImage(false);
            setImageUploadFile(null);
            setCompressedImageBlob(null);
            if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
            setImagePreviewUrl(null);
        } else {
             if (!authError && !dataCtxError) setProfileUpdateMessage({type: 'error', text: "Failed to remove profile image."});
        }
    }
  };

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
  };

  const handleLanguageDone = async () => {
    if (!authUser) return;
    const previous = authUser.preferredLanguage || i18n.language.split('-')[0] || 'en';
    if (selectedLanguage === previous) {
      setIsLanguageSettingsOpen(false);
      return;
    }
    setIsLanguageSaving(true);
    i18n.changeLanguage(selectedLanguage);
    const success = await updateUserDetails({ preferredLanguage: selectedLanguage });
    setIsLanguageSaving(false);
    if (!success) {
      setSelectedLanguage(previous);
      i18n.changeLanguage(previous);
    }
    setIsLanguageSettingsOpen(false);
  };

  const handleLanguageModalClose = () => {
    // Revert pending selection back to the last committed language
    setSelectedLanguage(authUser?.preferredLanguage || i18n.language.split('-')[0] || 'en');
    setIsLanguageSettingsOpen(false);
  };

  const handleDeleteUserConfirm = async () => {
    if (!profileUser || !deletionType) return;
    clearMessages();
    setIsProcessingAction(true);
    const success = await deleteUser(profileUser.id, deletionType);
    setIsProcessingAction(false);
    setShowDeleteConfirmModal(false);

    if (success) {
        logout();
        const message = deletionType === 'soft' ? 'Account disabled successfully.' : 'Account deleted successfully.';
        navigate(`/login?message=${encodeURIComponent(message)}`, { replace: true });
    } else if (!dataCtxError && !authError) {
        setProfileUpdateMessage({ type: 'error', text: 'Failed to delete account.' });
    }
  };

  const handleConfirmRemoveUserFromOrg = async () => {
    if (!profileUser || !authUser) return;

    let orgToRemoveId: string | undefined;
    if (authUser.role === UserRole.WORKSPACE_ADMIN) {
        orgToRemoveId = authUser.selectedWorkspace?.id;
    } else if (authUser.role === UserRole.ORGANIZATION_ADMIN && profileUser.workspaceId) {
        orgToRemoveId = profileUser.workspaceId;
    }

    if (!orgToRemoveId) {
        setProfileUpdateMessage({ type: 'error', text: "Could not determine which WorkHub to remove the user from." });
        return;
    }

    setIsProcessingAction(true);
    const success = await removeUserFromWorkspace(orgToRemoveId, profileUser.id);
    setIsProcessingAction(false);
    setShowRemoveUserConfirmModal(false);

    if (success) {
        setProfileUpdateMessage({type: 'success', text: `User ${profileUser.name} removed from workspace.`});
    } else {
         if (!dataCtxError) setProfileUpdateMessage({type: 'error', text: 'Failed to remove user from workspace.'});
    }
  };

  const handleLogoutClick = () => {
    logout();
    navigate('/login', { replace: true });
  };
  
  const handleGoBack = () => {
    navigate(-1);
  };


  if (!profileUser && (authLoading || dataCtxLoading)) {
    return <div className="p-6 text-center text-gray-600 flex justify-center items-center h-full"><FiLoader className="animate-spin h-8 w-8 text-blue-500"/></div>;
  }
  if (!profileUser) {
    return <div className="p-6 text-center text-gray-600">User not found or you do not have permission to view this profile.</div>;
  }
  
  const showAdminActions = !isOwnProfile && (
    (authUser?.role === UserRole.WORKSPACE_ADMIN && profileUser.role === UserRole.REGULAR_USER && profileUser.workspaces.some(org => org.id === authUser.selectedWorkspace?.id)) ||
    ((authUser?.role === UserRole.ORGANIZATION_ADMIN || authUser?.role === UserRole.SYSTEM_ADMIN) && profileUser.role !== UserRole.ORGANIZATION_ADMIN && profileUser.role !== UserRole.SYSTEM_ADMIN)
  );

  const displayProfileImageUrl = (isOwnProfile && isEditingImage && imagePreviewUrl)
    ? imagePreviewUrl
    : (isOwnProfile ? (authUser?.profileImageUrl || `/default_user.webp`) : (profileUser.profileImageUrl || `/default_user.webp`));

  const tokenUsage = authUser?.tokenUsage;
  const showTokenUsage = isOwnProfile && tokenUsage && tokenUsage.limit !== null;
  const tokenPercentage = (tokenUsage && tokenUsage.limit) ? (tokenUsage.used / tokenUsage.limit) * 100 : 0;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-6 md:p-8 md:bg-white md:max-w-4xl md:mx-auto md:shadow-xl md:rounded-lg">
      {routeUserId && (
          <button
              onClick={handleGoBack}
              className="mb-6 inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              aria-label="Go back to previous page"
          >
              <FiArrowLeft className="mr-2 h-5 w-5 rtl-flip" />
                      {t('profile.backToUserList')}
          </button>
      )}
      
      {profileUpdateMessage && (
          <div id={profileUpdateMessage.type === 'error' ? 'profile-update-error' : undefined} role={profileUpdateMessage.type === 'error' ? 'alert' : 'status'} className={`p-3 mb-4 rounded-md flex items-center text-sm ${profileUpdateMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {profileUpdateMessage.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
              {profileUpdateMessage.text}
              <button onClick={clearMessages} className="ml-auto text-lg font-semibold">&times;</button>
          </div>
      )}

      <div className="flex flex-col md:flex-row items-center md:items-start mb-8 pb-6 border-b border-gray-200">
        <div className="relative group">
          <img 
            src={displayProfileImageUrl}
            alt={profileUser.name} 
            className="w-24 h-24 md:w-32 md:h-32 rounded-full mr-0 md:mr-8 mb-4 md:mb-0 border-4 border-gray-300 shadow-md object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)} 
          />
          {isOwnProfile && !isEditingImage && (
              <button 
                  onClick={() => { 
                    setIsEditingImage(true); 
                    clearMessages(); 
                    const currentUrl = profileUser.profileImageUrl || '';
                    setEditedImageUrl(currentUrl); 
                    // Show URL input only if it's a web URL
                    setShowUrlInput(currentUrl.startsWith('http') || currentUrl.startsWith('https'));
                    setImageUploadFile(null);
                    setImagePreviewUrl(null);
                  }}
                  className="absolute bottom-2 right-2 md:bottom-4 md:right-10 bg-white p-2 rounded-full shadow-md hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                  title={t('profile.editProfileImage')}
              >
                  <FiCamera size={18} className="text-blue-500"/>
              </button>
          )}
        </div>
        {isOwnProfile && isEditingImage && (
          <div className="w-full md:w-auto md:ml-[-2rem] mt-2 md:mt-0 md:pl-8 flex-grow">
              {showUrlInput ? (
                  <>
                    <label htmlFor="imageUrl" className="block text-sm font-medium text-gray-700 mb-1">{t('profile.imageUrl')}</label>
                    <div className="flex gap-2 mb-2">
                        <input
                            type="text"
                            id="imageUrl"
                            value={editedImageUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                setEditedImageUrl(e.target.value);
                                setImageUploadFile(null);
                                setImagePreviewUrl(null);
                            }}
                            placeholder={t('profile.pasteImageUrl')}
                            className="flex-grow p-2 border border-gray-300 rounded-md text-sm"
                        />
                    </div>
                  </>
              ) : (
                  <button 
                    onClick={() => {
                        setEditedImageUrl('');
                        setShowUrlInput(true);
                        setImageUploadFile(null);
                        setImagePreviewUrl(null);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 underline mb-3 flex items-center"
                  >
                    <FiLink className="mr-1"/> {t('profile.useImageUrl')}
                  </button>
              )}

              <div className="mb-2">
                  <label htmlFor="imageUpload" className="cursor-pointer inline-flex items-center px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
                      <FiUploadCloud className="mr-2"/> {t('profile.uploadImage')}
                  </label>
                  <input type="file" id="imageUpload" accept="image/jpeg, image/png, image/webp" onChange={handleImageFileChange} className="hidden"/>
              </div>
              <div className="flex space-x-2">
                  <button onClick={handleSaveImage} disabled={authLoading || dataCtxLoading} className="p-2 bg-green-500 text-white rounded-md text-sm hover:bg-green-600 disabled:opacity-50 flex items-center"><FiSave className="mr-1"/> {t('profile.saveImage')}</button>
                  <button onClick={() => {
                    setIsEditingImage(false);
                    clearMessages();
                    setEditedImageUrl(profileUser.profileImageUrl || '');
                    setImageUploadFile(null);
                    setImagePreviewUrl(null);
                  }} className="p-2 bg-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-400">{t('common.cancel')}</button>
              </div>
          </div>
        )}

        {!isEditingImage && (
          <div className={`text-center md:text-left flex-grow ${isOwnProfile && isEditingImage ? 'hidden' : ''}`}>
            {!isEditingDetails && (
              <>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-800">{isOwnProfile ? (authUser?.name ?? profileUser.name) : profileUser.name}</h1>
                <p className="text-gray-600 text-lg">{isOwnProfile ? (authUser?.email ?? profileUser.email) : profileUser.email}</p>
              </>
            )}
            {isOwnProfile && isEditingDetails && (
              <div className="space-y-3 mb-3">
                  <p className="text-xs text-gray-500">{t('common.mandatoryFields')}</p>
                  <div>
                      <label htmlFor="nameEdit" className="block text-sm font-medium text-gray-700">{t('common.name')} <span aria-hidden="true">*</span></label>
                      <input id="nameEdit" type="text" value={editedName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditedName(e.target.value)} required aria-required="true" aria-describedby={profileUpdateMessage?.type === 'error' ? 'profile-update-error' : undefined} className="mt-1 p-2 border border-gray-300 rounded-md w-full sm:w-auto"/>
                  </div>
                  <div className="flex space-x-2">
                      <button onClick={handleSaveDetails} disabled={authLoading || dataCtxLoading} className="p-2 bg-green-500 text-white rounded-md text-sm hover:bg-green-600 disabled:opacity-50"><FiSave className="mr-1"/> {t('profile.saveDetails')}</button>
                      <button onClick={() => { setIsEditingDetails(false); setEditedName(profileUser.name); clearMessages(); }} className="p-2 bg-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-400">{t('common.cancel')}</button>
                  </div>
              </div>
            )}
            
            <div className="mt-2">
                <div className="flex items-center justify-center md:justify-start">
                    <p className="text-sm text-gray-500">{t('profile.role')}: <span className="font-semibold capitalize">{profileUser.role.replace(/_/g, ' ')}</span></p>
                </div>
            </div>

            <div className="mt-2">
                <div className="flex items-center justify-center md:justify-start">
                    <p className="text-sm text-gray-500">
                        {t('profile.workspaces')}: <span className="font-semibold">
                            {profileUser.role === UserRole.SYSTEM_ADMIN
                                ? 'System-Wide Access'
                                : profileUser.workspaces.filter(o => !o.isPersonal).map(o => o.name).join(', ') || 'N/A'}
                        </span>
                    </p>
                </div>
            </div>
          </div>
        )}
      </div>

      {showTokenUsage && (
          <div className="mb-8 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="text-lg font-semibold text-purple-800 mb-2 flex items-center"><FiCpu className="mr-2"/> {t('profile.monthlyTokenUsage')}</h3>
              <div className="w-full">
                  <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-purple-700">{tokenUsage!.used.toLocaleString()}</span>
                      <span className="text-gray-500">/ {tokenUsage!.limit!.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${tokenPercentage > 100 ? 'bg-red-500' : 'bg-purple-600'}`} style={{ width: `${Math.min(tokenPercentage, 100)}%` }}></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{t('profile.tokenUsageNote')}</p>
              </div>
          </div>
      )}
      
      {/* --- REFACTORED ACTIONS SECTION --- */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        {isOwnProfile && (
            <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('profile.profileActions')}</h3>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-y-2 gap-x-4 flex-wrap">
                    <button 
                        onClick={() => {setIsEditingDetails(true); clearMessages();}} 
                        className="text-sm text-blue-600 hover:text-blue-800 py-1 px-2 rounded-md hover:bg-blue-50 flex items-center transition-colors"
                    >
                        <FiEdit3 className="mr-2"/> {t('profile.editDetails')}
                    </button>
                    {canSwitchContexts && (
                    <button 
                        onClick={startContextSwitch} 
                        className="text-sm text-purple-600 hover:text-purple-800 py-1 px-2 rounded-md hover:bg-purple-50 flex items-center transition-colors"
                    >
                        <FiRepeat className="mr-2"/> {t('profile.switchRole')}
                    </button>
                    )}
                    <button 
                        onClick={() => {setIsChangingPassword(true); clearMessages();}} 
                        className="text-sm text-orange-600 hover:text-orange-800 py-1 px-2 rounded-md hover:bg-orange-50 flex items-center transition-colors"
                    >
                        <FiKey className="mr-2"/> {authUser?.hasPassword ? t('profile.changePassword') : t('profile.createPassword')}
                    </button>
                    <button
                        onClick={() => { setIsLanguageSettingsOpen(true); clearMessages(); }}
                        className="text-sm text-teal-600 hover:text-teal-800 py-1 px-2 rounded-md hover:bg-teal-50 flex items-center transition-colors"
                        aria-label={t('profile.openLanguageSettings')}
                    >
                        <FiGlobe className="mr-2" /> {t('profile.language')}
                    </button>
                    <button
                        onClick={handleLogoutClick}
                        className="text-sm text-gray-600 hover:text-gray-800 py-1 px-2 rounded-md hover:bg-gray-50 flex items-center transition-colors"
                    >
                        <FiLogOut className="mr-2"/> {t('profile.logout')}
                    </button>
                </div>

                <div className="mt-6">
                    <button
                        onClick={() => { clearMessages(); setDeletionType(null); setShowDeleteConfirmModal(true); }}
                        className="text-sm text-red-600 hover:text-red-800 py-1 px-2 rounded-md hover:bg-red-50 flex items-center transition-colors"
                        >
                        <FiTrash2 className="mr-2" />
                        {t('profile.deleteMyAccount')}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">{t('profile.deleteAccountNote')}</p>
                </div>
            </div>
        )}

        {showAdminActions && (
            <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('profile.administrativeActions')}</h3>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-y-2 gap-x-4 flex-wrap">
                    <button
                        onClick={() => { clearMessages(); setShowRemoveUserConfirmModal(true); }}
                        disabled={isProcessingAction || authLoading || dataCtxLoading}
                        className="text-sm text-orange-600 hover:text-orange-800 py-1 px-2 rounded-md hover:bg-orange-50 flex items-center transition-colors disabled:opacity-50"
                    >
                        <FiUserMinus className="mr-2" />
                        {t('profile.removeFromWorkspace')}
                    </button>
                    {/* Future admin actions can be added here */}
                </div>
            </div>
        )}
      </div>

      {isOwnProfile && isLanguageSettingsOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="language-settings-title">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md animate-fade-in-up">
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                    <h3 id="language-settings-title" className="text-xl font-semibold text-gray-800 flex items-center">
                        <FiGlobe className="mr-2 text-teal-500" />
                        {t('profile.displayLanguage')}
                    </h3>
                    <button
                        onClick={handleLanguageModalClose}
                        className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
                        aria-label={t('profile.closeLanguageSettings')}
                        data-modal-escape
                    >
                        <FiX size={24} />
                    </button>
                </div>

                <div className="space-y-2">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => handleLanguageChange(lang.code)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                                selectedLanguage === lang.code
                                    ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                            }`}
                            aria-pressed={selectedLanguage === lang.code}
                        >
                            <span style={{ direction: lang.dir as 'ltr' | 'rtl' }}>{lang.name}</span>
                            {selectedLanguage === lang.code && (
                                <FiCheckCircle className="text-teal-500" size={18} aria-hidden="true" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleLanguageDone}
                        disabled={isLanguageSaving}
                        className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 font-medium transition-colors disabled:opacity-60"
                    >
                        {isLanguageSaving ? t('common.saving') : t('common.done')}
                    </button>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
      )}

      {isOwnProfile && isChangingPassword && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">{authUser?.hasPassword ? t('profile.changePassword') : t('profile.createNewPassword')}</h3>
                    <button onClick={() => {setIsChangingPassword(false); clearMessages(); setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmPassword(false);}} className="text-gray-500 hover:text-gray-700" aria-label={t('common.close')}><FiX size={24} /></button>
                </div>
                {profileUpdateMessage && profileUpdateMessage.text && (
                     <div id={profileUpdateMessage.type === 'error' ? 'password-change-error' : undefined} role={profileUpdateMessage.type === 'error' ? 'alert' : 'status'} className={`p-3 mb-4 rounded-md flex items-center text-sm ${profileUpdateMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {profileUpdateMessage.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
                        {profileUpdateMessage.text}
                    </div>
                )}
                <p className="text-xs text-gray-500">{t('common.mandatoryFields')}</p>
                <div className="space-y-4">
                    {authUser?.hasPassword && (
                        <div>
                            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">{t('profile.currentPassword')} <span aria-hidden="true">*</span></label>
                            <div className="relative mt-1">
                                <input id="currentPassword" type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)} required aria-required="true" aria-describedby={profileUpdateMessage?.type === 'error' ? 'password-change-error' : undefined} className="p-2 w-full border border-gray-300 rounded-md pr-10"/>
                                <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600" aria-label={showCurrentPassword ? t('common.hidePassword') : t('common.showPassword')}>
                                    {showCurrentPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                                </button>
                            </div>
                        </div>
                    )}
                    <div>
                        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">{t('auth.newPassword')} <span aria-hidden="true">*</span></label>
                        <div className="relative mt-1">
                            <input id="newPassword" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)} required aria-required="true" aria-describedby={profileUpdateMessage?.type === 'error' ? 'password-change-error' : undefined} className="p-2 w-full border border-gray-300 rounded-md pr-10"/>
                            <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600" aria-label={showNewPassword ? t('common.hidePassword') : t('common.showPassword')}>
                                {showNewPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                            </button>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{t('auth.passwordHint')}</p>
                    </div>
                    <div>
                        <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">{t('auth.confirmNewPassword')} <span aria-hidden="true">*</span></label>
                        <div className="relative mt-1">
                            <input id="confirmNewPassword" type={showConfirmPassword ? 'text' : 'password'} value={confirmNewPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmNewPassword(e.target.value)} required aria-required="true" aria-describedby={profileUpdateMessage?.type === 'error' ? 'password-change-error' : undefined} className="p-2 w-full border border-gray-300 rounded-md pr-10"/>
                            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600" aria-label={showConfirmPassword ? t('common.hideConfirmPassword') : t('common.showConfirmPassword')}>
                                {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-end space-x-2">
                        <button onClick={() => {setIsChangingPassword(false); clearMessages(); setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmPassword(false);}} className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">{t('common.cancel')}</button>
                        <button onClick={handleChangePassword} disabled={authLoading || dataCtxLoading} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50">
                            {(authLoading || dataCtxLoading) ? t('common.saving') : t('profile.savePassword')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
      )}

      {showDeleteConfirmModal && profileUser && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full">
            <div className="flex items-start mb-4">
                <FiAlertTriangle className="text-red-500 h-8 w-8 mr-3 flex-shrink-0 mt-1"/>
                <div>
                    <h3 className="text-xl font-semibold text-gray-800">{t('profile.deleteYourAccount')}</h3>
                    <p className="text-sm text-gray-500">{t('profile.deleteAccountChoose')}</p>
                </div>
            </div>
            
            <div className="space-y-4 mb-6">
                <label className={`block p-4 border-2 rounded-lg cursor-pointer ${deletionType === 'soft' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                    <div className="flex items-center">
                        <input type="radio" name="deletionType" value="soft" checked={deletionType === 'soft'} onChange={() => setDeletionType('soft')} className="h-4 w-4 text-orange-600 focus:ring-orange-500"/>
                        <div className="ml-3">
                            <span className="font-semibold text-orange-800">{t('profile.temporarilyDisable')}</span>
                            <p className="text-sm text-orange-700">{t('profile.temporarilyDisableDesc')}</p>
                        </div>
                    </div>
                </label>
                 <label className={`block p-4 border-2 rounded-lg cursor-pointer ${deletionType === 'hard' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                    <div className="flex items-center">
                        <input type="radio" name="deletionType" value="hard" checked={deletionType === 'hard'} onChange={() => setDeletionType('hard')} className="h-4 w-4 text-red-600 focus:ring-red-500"/>
                        <div className="ml-3">
                            <span className="font-semibold text-red-800">{t('profile.permanentlyDelete')}</span>
                            <p className="text-sm text-red-700">{t('profile.permanentlyDeleteDesc')}</p>
                        </div>
                    </div>
                </label>
            </div>

            {deletionType === 'hard' && (
                <div className="mb-6 p-3 bg-red-50 rounded-md text-sm text-red-800">
                    <p className="font-semibold">{t('profile.permanentDataWarning')}</p>
                    <p>{t('profile.permanentDataList')}</p>
                </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowDeleteConfirmModal(false); clearMessages();}}
                disabled={isProcessingAction}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDeleteUserConfirm}
                disabled={isProcessingAction || !deletionType}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center disabled:opacity-50"
              >
                {isProcessingAction && <FiLoader className="animate-spin mr-2" />}
                {isProcessingAction ? t('common.processing') : t('profile.confirmAction')}
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('modal-root')!
      )}

      {showRemoveUserConfirmModal && profileUser && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full">
            <div className="flex items-start mb-4">
                <FiAlertTriangle className="text-orange-500 h-8 w-8 mr-3 flex-shrink-0 mt-1"/>
                <div>
                    <h3 className="text-xl font-semibold text-gray-800">{t('profile.confirmUserRemoval')}</h3>
                </div>
            </div>
            
            <p className="text-gray-600 mb-6">
                {t('profile.confirmRemoveUser', { name: profileUser.name })}
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowRemoveUserConfirmModal(false)}
                disabled={isProcessingAction}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmRemoveUserFromOrg}
                disabled={isProcessingAction}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center disabled:opacity-50"
              >
                {isProcessingAction && <FiLoader className="animate-spin mr-2" />}
                {isProcessingAction ? t('profile.removing') : t('profile.confirmRemoval')}
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('modal-root')!
      )}
      
    </div>
  );
};

export default ProfilePage;