import React from 'react';
import { useTranslation } from 'react-i18next';

const AccessibilityContent: React.FC = () => {
    const { t } = useTranslation();
    return (
        <section id="accessibility" className="space-y-8 text-gray-700">

            {/* 1. Commitment */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section1')}</h2>
                <p>
                    Gymind is committed to providing an accessible digital learning experience for all users. We design our
                    platform and interface to meet recognized accessibility standards and to remove barriers that could prevent
                    people with disabilities from using our services.
                </p>
                <p className="mt-2">
                    This statement explains our accessibility goals, what we do to meet them, the limits of our responsibility
                    given our service model, and how you can contact us with accessibility issues.
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 2. Scope & model of the service */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section2')}</h2>
                <p>
                    Our platform is a web-based SaaS learning environment where the instructional content is primarily created
                    and uploaded by users. Much of that content is presented in embedded players (for example, videos embedded
                    via an iframe served by third-party providers such as YouTube). We do not host or store user videos on our
                    servers unless explicitly stated otherwise.
                </p>
                <p className="mt-2">
                    Because our platform functions as a content platform rather than a content producer in most cases, our
                    responsibilities and remedies differ from cases where we produce, curate, or sell official course content.
                    The distinctions and our approach are described below.
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 3. Standards and conformance */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section3')}</h2>
                <p>
                    We aim to make the platform's user interface and all first-party functionality conform to the Web Content
                    Accessibility Guidelines (WCAG) 2.1 Level AA as published by the World Wide Web Consortium (W3C).
                    Conformance applies to UI components we build and control (menus, navigation, forms, controls, chat, AI
                    responses, onboarding flows, etc.).
                </p>
                <p className="mt-2">
                    Where national standards apply, we align with the applicable local accessibility obligations and standards
                    (for example, Israel's accessibility requirements and standards such as IS 5568 and the guidance published
                    by the Israeli government), and we follow recognized implementation checklists for conformance verification.
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 4. Third-party and user-generated content */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section4')}</h2>
                <p>
                    <strong>User-generated content (UGC):</strong> Users who create, upload, or embed materials on our platform
                    are primarily responsible for ensuring that those materials meet accessibility requirements (for example,
                    providing captions, transcripts, or accessible document formats). Where UGC is shown as part of an official
                    course or packaged learning path that we market or sell, we take a more active role in ensuring
                    accessibility for that content (see "When we assume responsibility" below).
                </p>
                <p className="mt-2">
                    <strong>Embedded third-party players (e.g., YouTube):</strong> When videos are embedded from third-party
                    platforms, captioning and transcript availability depend on the uploader and platform settings. Providers
                    such as YouTube offer automatic captioning features but the accuracy and availability vary; platform
                    embedding may allow us to request captions to be shown by default, but we do not control or create captions
                    for content hosted externally unless specifically contracted to do so. For technical details on automated
                    captions and platform features, consult the third-party provider's support documentation.
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 5. When we assume responsibility */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section5')}</h2>
                <p>We will take direct responsibility for accessibility when one or more of the following apply:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>
                        We produce, curate, certify, or sell a course or learning package as part of our official product
                        offering (i.e., content presented or endorsed by Gymind).
                    </li>
                    <li>
                        A customer has a contractual arrangement that includes delivery of accessible content (e.g., a paid
                        content partner contract).
                    </li>
                    <li>
                        We explicitly host or store the content on our servers and deliver it as first-party content.
                    </li>
                </ul>
                <p className="mt-2">
                    In those cases we will ensure captions/transcripts and other necessary accessibility features are provided
                    (either by us, the content owner, or an agreed third party).
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 6. Reasonable accommodations and alternatives */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section6')}</h2>
                <p>
                    If a particular item of user-generated or third-party content is not accessible (for example, a video lacks
                    captions), we will, upon receiving a valid accessibility request:
                </p>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Attempt to obtain captions or a transcript from the content uploader/owner.</li>
                    <li>
                        If captions cannot be obtained, we will provide an alternative, where feasible — for example, a
                        human-prepared transcript, a text summary, or an alternative learning resource covering the same
                        learning outcomes.
                    </li>
                    <li>
                        If neither is feasible, we will work with the requester and the content owner to identify reasonable
                        accommodations.
                    </li>
                </ol>
                <p className="mt-2">
                    See "How to request accessible content" below for how to submit a request. For guidance on best practices
                    for making videos accessible, see recognized accessibility resources.
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 7. Limitations and legal position */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section7')}</h2>
                <ul className="list-disc list-inside space-y-2">
                    <li>
                        <strong>Platform model:</strong> Because most instructional content on our platform is uploaded,
                        embedded, or controlled by third parties (UGC or external hosts), Gymind cannot guarantee that every
                        piece of content will be fully accessible at all times. That said, we require content creators and
                        partners to follow our accessibility policy (see "Creator requirements" below) when using the platform
                        to deliver courses to learners.
                    </li>
                    <li>
                        <strong>Third-party features:</strong> Some accessibility behaviors (for example, default caption
                        rendering, autoplay behavior, or media player UI) are controlled by third-party players. We will use
                        available embed options and configuration parameters to improve accessibility where possible (for
                        example, requesting closed captions to be enabled via embed parameters), but we cannot override the
                        policies and technical limits of the third-party provider.
                    </li>
                    <li>
                        <strong>Legal compliance:</strong> We endeavor to meet applicable legal accessibility obligations in
                        every jurisdiction where we operate or market our services. In Israel, for example, public-facing
                        digital services are expected to conform with national accessibility requirements and to follow
                        WCAG-based standards; consequently, we adopt those standards for our first-party interface and require
                        reasonable steps to make learning content accessible. This statement is not legal advice — if you need
                        a legal opinion for a specific contract or jurisdiction, consult a qualified attorney.
                    </li>
                </ul>
            </div>

            <hr className="border-gray-200" />

            {/* 8. Creator / uploader requirements */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section8')}</h2>
                <p>
                    All users, instructors, and partners who upload or embed content to our platform must adhere to the
                    following minimum requirements for content intended for public learning:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>
                        Provide accurate captions (closed captions) for all spoken audio in videos, or attach a full
                        transcript.
                    </li>
                    <li>Provide text alternatives for meaningful images and diagrams.</li>
                    <li>
                        Provide accessible document formats (e.g., tagged PDF or HTML) rather than image-only PDFs.
                    </li>
                    <li>
                        Where an embedded third-party video lacks proper captions, include a transcript or learning summary
                        in the course materials.
                    </li>
                </ul>
                <p className="mt-2">
                    We will enforce these requirements through platform tools (uploader reminders, metadata checks) and, where
                    necessary, content takedown, labeling, or disabling of content that does not meet minimum accessibility
                    standards for published/paid courses.
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 9. How to request accessible content / report a barrier */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">
                    {t('legal.accessibility.section9')}
                </h2>
                <p>
                    If you encounter an accessibility barrier on our platform (missing captions, inaccessible quizzes,
                    problems with keyboard navigation, etc.), please contact us with the following details:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Page or course name and URL (if available)</li>
                    <li>Description of the accessibility barrier you encountered</li>
                    <li>Preferred contact method and any reasonable accommodation you request</li>
                </ul>
                <p className="mt-3">
                    <strong>Contact:</strong> Gymind's accessibility manager.
                    <br />
                    <strong>Email:</strong>{' '}
                    <a href="mailto:info@gymind.app" className="text-blue-600 hover:underline">
                        info@gymind.app
                    </a>
                </p>
                <p className="mt-2">When we receive a request we will:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Acknowledge receipt of your request promptly.</li>
                    <li>
                        Work with the content owner or our team to identify and implement a suitable accommodation or
                        remedial measure.
                    </li>
                    <li>Keep you informed about the outcome and any interim measures.</li>
                </ul>
                <p className="mt-2 text-sm text-gray-500">
                    (For legal or formal complaints in certain jurisdictions, additional complaint routes may exist and can
                    be pursued with the relevant authorities.)
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 10. Testing, audits and verification */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section10')}</h2>
                <p>
                    We perform automated and manual accessibility testing on our first-party UI using recognized tools and
                    processes (for example, automated scanners plus manual testing with screen readers, keyboard-only
                    navigation, and zoom testing). We may also engage external accessibility consultants for periodic audits
                    to verify conformance with WCAG 2.1 AA for the parts of the product we control. Example tools and checks
                    include WCAG quick references and accessibility checklists.
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 11. Enforcement & takedown policy */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">
                    {t('legal.accessibility.section11')}
                </h2>
                <p>
                    For content that fails to meet minimum accessibility requirements and that is part of a published, sold,
                    or certified course, we may:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>
                        Require the content owner to add captions/transcripts within a specified remediation timeframe.
                    </li>
                    <li>
                        Temporarily label the content as "may not be accessible" and provide alternate resources.
                    </li>
                    <li>
                        Remove or disable content that repeatedly fails to meet our accessibility requirements after
                        reasonable notice (for example, for paid/official courses).
                    </li>
                </ul>
                <p className="mt-2">
                    For casual UGC (free, un-endorsed uploads), we will follow notice-and-take-down procedures and encourage
                    creators to remediate content promptly.
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 12. Jurisdictional notes */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section12')}</h2>
                <p>
                    Accessibility laws and enforcement vary by jurisdiction. Organizations operating in or serving users in
                    other territories (for example, the EU, UK, or the US) may be subject to additional or different
                    obligations beyond those described here. We aim to align our platform with international best practices
                    (WCAG 2.1 AA) to reduce cross-jurisdictional risk, but this statement does not alter legal obligations
                    that may apply to specific customers or content providers. For information about rights and complaint
                    pathways in the EU, see the relevant EU guidance on platform user rights.
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 13. Updates to this statement */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section13')}</h2>
                <p>
                    We review and update this Accessibility Statement periodically to reflect changes in law, industry
                    guidance, third-party platform capabilities, and our remediation processes.{' '}
                    <strong>Last updated: February 28, 2026.</strong>
                </p>
            </div>

            <hr className="border-gray-200" />

            {/* 14. Where to get more information */}
            <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">{t('legal.accessibility.section14')}</h2>
                <ul className="list-disc list-inside space-y-1">
                    <li>WCAG 2.1 guidelines (W3C).</li>
                    <li>Israeli government guidance on website accessibility.</li>
                    <li>YouTube support on automated captions and captioning features.</li>
                    <li>Practical accessibility checklists and testing guidance (e.g. WebAIM / Deque).</li>
                </ul>
            </div>

        </section>
    );
};

export default AccessibilityContent;
