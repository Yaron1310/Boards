import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { Course } from '../../../types';
import { FiSave, FiLoader, FiUpload, FiImage, FiX, FiSend } from 'react-icons/fi';
import * as apiService from '../../../services/geminiService';

interface CourseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (courseData: { name: string; description: string; coverImage?: string; promoVideoUrl?: string }) => Promise<void>;
    course: Partial<Course> | null;
    isLoading: boolean;
}

const MAX_RAW_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Compress a File (from upload) to JPEG 600px / q0.80
const compressFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { resolve(resizeAndEncode(img)); };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });

// Compress a data URL (from AI) to JPEG 600px / q0.80
const compressDataUrl = (dataUrl: string): Promise<string> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { resolve(resizeAndEncode(img)); };
        img.onerror = reject;
        img.src = dataUrl;
    });

const resizeAndEncode = (img: HTMLImageElement): string => {
    const MAX_DIMENSION = 600;
    const QUALITY = 0.80;
    let { width, height } = img;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) { height = Math.round((height / width) * MAX_DIMENSION); width = MAX_DIMENSION; }
        else { width = Math.round((width / height) * MAX_DIMENSION); height = MAX_DIMENSION; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', QUALITY);
};

const CourseModal: React.FC<CourseModalProps> = ({ isOpen, onClose, onSave, course, isLoading }) => {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({ name: '', description: '', promoVideoUrl: '' });
    const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
    const [coverImageData, setCoverImageData] = useState<string | undefined>(undefined);
    const [imageError, setImageError] = useState<string | null>(null);

    // AI instructions mini-modal state
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [customInstructions, setCustomInstructions] = useState('');
    const [imageStyle, setImageStyle] = useState<'realistic' | 'illustration'>('realistic');
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);

    useEffect(() => {
        if (course) {
            setFormData({ name: course.name || '', description: course.description || '', promoVideoUrl: course.promoVideoUrl || '' });
            setCoverImagePreview(course.coverImage || null);
            setCoverImageData(undefined);
        } else {
            setFormData({ name: '', description: '', promoVideoUrl: '' });
            setCoverImagePreview(null);
            setCoverImageData(undefined);
        }
        setImageError(null);
        setAiModalOpen(false);
        setCustomInstructions('');
        setImageStyle('realistic');
    }, [course, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        setImageError(null);
        const file = e.target.files?.[0];
        if (!file) return;
        if (!ALLOWED_TYPES.includes(file.type)) {
            setImageError(t('admin.course.imageTypeError', 'Only JPEG, PNG, and WebP images are allowed.'));
            return;
        }
        if (file.size > MAX_RAW_SIZE) {
            setImageError(t('admin.course.imageSizeError', 'Image must be smaller than 10 MB.'));
            return;
        }
        try {
            const compressed = await compressFile(file);
            setCoverImagePreview(compressed);
            setCoverImageData(compressed);
        } catch {
            setImageError(t('admin.course.imageCompressError', 'Failed to process the image.'));
        }
        e.target.value = '';
    };

    const handleOpenAiModal = () => {
        if (!formData.name.trim()) {
            setImageError(t('admin.course.aiImageNeedName', 'Please enter a course name before generating an image.'));
            return;
        }
        setImageError(null);
        const parts = [formData.name.trim()];
        if (formData.description.trim()) parts.push(formData.description.trim());
        setCustomInstructions(parts.join('\n\n'));
        setAiModalOpen(true);
    };

    const handleGenerateWithAI = async () => {
        setIsGeneratingImage(true);
        try {
            const result = await apiService.generateCourseCoverImage(
                customInstructions.trim(),
                imageStyle
            );
            // Compress AI image before storing (can be >1 MB)
            const compressed = await compressDataUrl(result.imageData);
            setCoverImagePreview(compressed);
            setCoverImageData(compressed);
            setAiModalOpen(false);
            setCustomInstructions('');
        } catch (err: any) {
            setImageError(err.message || t('admin.course.aiImageError', 'Failed to generate image with AI.'));
            setAiModalOpen(false);
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleRemoveImage = () => {
        setCoverImagePreview(null);
        setCoverImageData('');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ ...formData, coverImage: coverImageData, promoVideoUrl: formData.promoVideoUrl.trim() || undefined });
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <>
            {/* Main course modal */}
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="course-modal-title">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                    {/* Sticky header */}
                    <div className="px-6 pt-6 pb-4 border-b border-gray-200 flex-shrink-0">
                        <h2 id="course-modal-title" className="text-xl font-bold">
                            {course?.id ? t('admin.editCourseDetails') : t('admin.createNewCourse')}
                        </h2>
                    </div>
                    <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                        {/* Scrollable content */}
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                            <p className="text-xs text-gray-500">{t('checkout.requiredFieldsNote')}</p>

                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                                    {t('admin.courseName')} <span aria-hidden="true">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    id="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                                    required
                                    aria-required="true"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-baseline">
                                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                                        {t('common.description')} <span aria-hidden="true">*</span>
                                    </label>
                                    <span className={`text-xs ${formData.description.length >= 250 ? 'text-red-500 font-semibold' : 'text-gray-400'}`} aria-live="polite">
                                        {formData.description.length}/250
                                    </span>
                                </div>
                                <textarea
                                    name="description"
                                    id="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    rows={3}
                                    maxLength={250}
                                    className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                                    required
                                    aria-required="true"
                                    aria-describedby="description-count"
                                />
                            </div>

                            <div>
                                <label htmlFor="promoVideoUrl" className="block text-sm font-medium text-gray-700">
                                    {t('admin.course.promoVideoUrl', 'Promo Video URL')}
                                </label>
                                <input
                                    type="url"
                                    name="promoVideoUrl"
                                    id="promoVideoUrl"
                                    value={formData.promoVideoUrl}
                                    onChange={handleChange}
                                    className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                                    placeholder={t('admin.course.promoVideoUrlPlaceholder', 'https://youtube.com/watch?v=… or https://vimeo.com/…') as string}
                                />
                            </div>

                            {/* Cover Image Section */}
                            <div>
                                <span className="block text-sm font-medium text-gray-700 mb-2">
                                    {t('admin.course.coverImage', 'Cover Image')}
                                </span>

                                {/* Image preview — shows full image without clipping */}
                                {coverImagePreview && (
                                    <div className="relative mb-3 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                                        <img
                                            src={coverImagePreview}
                                            alt="Course cover preview"
                                            className="w-full h-auto block"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleRemoveImage}
                                            className="absolute top-2 right-2 bg-white bg-opacity-90 rounded-full p-1 shadow hover:bg-red-50 transition-colors"
                                            aria-label={t('admin.course.removeImage', 'Remove cover image')}
                                        >
                                            <FiX className="h-4 w-4 text-gray-600" aria-hidden="true" />
                                        </button>
                                    </div>
                                )}

                                {/* Upload / AI buttons */}
                                <div className="flex gap-2">
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        aria-label={t('admin.course.uploadImage', 'Upload cover image file')}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                        aria-label={t('admin.course.uploadImage', 'Upload cover image')}
                                    >
                                        <FiUpload className="h-4 w-4" aria-hidden="true" />
                                        {t('admin.course.uploadImage', 'Upload Image')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenAiModal}
                                        disabled={isGeneratingImage}
                                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
                                        aria-label={t('admin.course.createWithAI', 'Generate cover image with AI')}
                                    >
                                        <FiImage className="h-4 w-4" aria-hidden="true" />
                                        {t('admin.course.createWithAI', 'Create with AI')}
                                    </button>
                                </div>

                                <p className="mt-2 text-xs text-gray-400">
                                    {t('admin.course.imageHint', 'Recommended: landscape photo, min 600×370px. JPEG, PNG or WebP, max 10 MB.')}
                                </p>

                                {imageError && (
                                    <p className="mt-1.5 text-xs text-red-600" role="alert">{imageError}</p>
                                )}
                            </div>
                        </div>
                        {/* Sticky footer */}
                        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 flex justify-end space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isLoading || isGeneratingImage}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading || isGeneratingImage}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                            >
                                {isLoading && <FiLoader className="animate-spin mr-2" aria-hidden="true" />}
                                <FiSave className="mr-2" aria-hidden="true" />
                                {t('admin.saveCourse')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* AI instructions mini-modal */}
            {aiModalOpen && (
                <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 60 }} role="dialog" aria-modal="true" aria-labelledby="ai-instructions-title">
                    <div className="absolute inset-0 bg-black bg-opacity-40" onClick={() => !isGeneratingImage && setAiModalOpen(false)} />
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
                        <h3 id="ai-instructions-title" className="text-base font-semibold text-gray-800 mb-1 flex items-center gap-2">
                            <FiImage className="text-purple-500" aria-hidden="true" />
                            {t('admin.course.aiInstructionsTitle', 'AI Image Instructions')}
                        </h3>
                        <p className="text-xs text-gray-400 mb-3">
                            {t('admin.course.aiInstructionsHint', 'Edit or expand the text below to guide the AI. The course name and description are pre-filled as a starting point.')}
                        </p>
                        <textarea
                            value={customInstructions}
                            onChange={e => setCustomInstructions(e.target.value)}
                            rows={6}
                            maxLength={2000}
                            placeholder={t('admin.course.aiInstructionsPlaceholder', 'E.g. "warm earthy tones, outdoor setting"') as string}
                            className="w-full p-2 border border-gray-300 rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-purple-400"
                            disabled={isGeneratingImage}
                            aria-label={t('admin.course.aiInstructionsTitle', 'AI Image Instructions')}
                        />

                        {/* Image style radio buttons */}
                        <fieldset className="mt-3">
                            <legend className="text-xs font-medium text-gray-600 mb-1.5">
                                {t('admin.course.imageStyleLabel', 'Image style')}
                            </legend>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="imageStyle"
                                        value="realistic"
                                        checked={imageStyle === 'realistic'}
                                        onChange={() => setImageStyle('realistic')}
                                        disabled={isGeneratingImage}
                                        className="accent-purple-600"
                                    />
                                    {t('admin.course.imageStyleRealistic', 'Realistic photo')}
                                </label>
                                <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="imageStyle"
                                        value="illustration"
                                        checked={imageStyle === 'illustration'}
                                        onChange={() => setImageStyle('illustration')}
                                        disabled={isGeneratingImage}
                                        className="accent-purple-600"
                                    />
                                    {t('admin.course.imageStyleIllustration', 'Graphic illustration')}
                                </label>
                            </div>
                        </fieldset>

                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => setAiModalOpen(false)}
                                disabled={isGeneratingImage}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 disabled:opacity-50"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleGenerateWithAI}
                                disabled={isGeneratingImage || !customInstructions.trim()}
                                className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 disabled:opacity-50"
                                aria-label={t('admin.course.generateButton', 'Generate image')}
                            >
                                {isGeneratingImage
                                    ? <FiLoader className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    : <FiSend className="h-4 w-4" aria-hidden="true" />}
                                {isGeneratingImage
                                    ? t('admin.course.generatingImage', 'Generating…')
                                    : t('admin.course.generateButton', 'Generate')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.getElementById('modal-root')!
    );
};

export default CourseModal;
