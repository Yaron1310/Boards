
import React from 'react';
import { useTranslation } from 'react-i18next';

const LegalContent: React.FC = () => {
    const { t } = useTranslation();
    const companyName = "Logyx innovative solutions"; // Main legal entity
    const serviceName = "Gymind";
    const contactEmail = "info@gymind.app";
    const effectiveDateToS = "March 6, 2025";
    const effectiveDatePrivacy = "October 22, 2024";

    return (
        <>
            <section id="terms" className="mb-12">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('legal.legal.title')}</h2>
                <p className="text-sm text-gray-500 mb-6">Effective as of {effectiveDateToS}</p>
                
                <div className="prose prose-sm text-gray-600 space-y-4 max-w-none">
                    <h3>General</h3>
                    <p>By accessing and using {serviceName}’s application programming interfaces, software, tools, data, documentation, or website (collectively, “Services”), you expressly agree that you have read and agreed to be bound by the following terms and conditions (the “Terms”) as well as all applicable laws and regulations, and any future updates. You also agree that you are 18 years or older and legally able to enter into a binding contract.</p>
                    <p>Unless otherwise specified, terms used below and in any of our other agreements or notices, including our Privacy Policy, have the following meanings:</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>"Gymind"</strong> (or "The Platform"): Refers to the software technology, infrastructure, and application hosting provider. We provide the tools for content delivery but do not create the educational curriculum.</li>
                        <li><strong>"Workspace"</strong>: Refers to the content creator, educator, or entity responsible for designing courses, configuring AI mentors, and managing educational material hosted on the Platform.</li>
                        <li><strong>"Workspace"</strong>: Refers to the business customer or entity that subscribes to an Workspace's content to provide access to its members/employees.</li>
                        <li><strong>"User"</strong> (or "You"): Refers to the individual end-user accessing the Platform to consume content, complete assignments, and interact with AI tools.</li>
                    </ul>
                    <p>"Client", “User”, “You” and “Your” refers to you, the person using Services and accepting the Terms or, if you are accepting these terms on behalf of an entity, also to the entity. "{serviceName}", “Ourselves”, “Our”, “We” and "Us", refer to our company, {companyName}. “Representatives” means {serviceName}’s personnel, advisors, affiliates, agents and suppliers. “Party”, “Parties”, or refers to both the Client and ourselves, or either the Client or ourselves.</p>
                    <p>These Terms and any policies incorporated in these Terms contain the entire agreement between you and {serviceName} regarding access to or use of the Services and, other than any Service specific terms of use or any applicable Enterprise agreements, supersedes any prior or contemporaneous agreements, communications, or understandings between you and {serviceName} on that subject.</p>

                    <h3>1. Privacy Statement</h3>
                    <p>We are committed to protecting your privacy. Our Privacy Policy explains how we collect, use and disclose personal information you provide to us when you access and use the Services.</p>

                    <h3>2. License to Use the Services</h3>
                    <p>We grant you a non-exclusive right to access and use the Services in accordance with these Terms. {serviceName} retains all right, title, and interest in and does not agree to any transfer of title regarding the Services. You are responsible for your account’s compliance with these Terms. You must maintain the security of your account, as applicable, and promptly notify us if you discover or suspect that someone has accessed your account without your permission. You will be responsible for all usage under your account whether or not it is authorized by you.</p>
                    <p>Notwithstanding the foregoing or anything to the contrary set forth herein, you may not:</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>Download, modify, copy, distribute, transmit, display, perform, reproduce, duplicate, publish, license, create derivative works from, or offer for sale any of our proprietary technology that makes up or is included in the Services, except (i) you may create and store temporary files that are automatically cached by your web browser for display purposes, and (ii) as otherwise expressly permitted in these Terms.</li>
                        <li>Submit, transmit, display, perform, post or store any content that is inaccurate, illegal, unlawful, defamatory, obscene, sexually explicit, pornographic, violent, invasive of privacy or publicity rights, harassing, threatening, abusive, inflammatory, harmful, hateful, cruel or insensitive, deceptive, or otherwise objectionable (collectively and individually, “Objectionable”).</li>
                        <li>Use the Services for bullying, disruptive or Objectionable purposes, or in a manner that violates our policies and standards or for political campaigning or lobbying purposes; or otherwise use the Services in a manner that is fraudulent, inciting, organizing, promoting or facilitating violence or criminal or harmful activities, or Objectionable purposes.</li>
                        <li>Duplicate, decompile, reverse engineer, disassemble or decode the Services (including any underlying idea or algorithm), or attempt to do any of the same.</li>
                        <li>Use, reproduce or remove any copyright, trademark, service mark, trade name, slogan, logo, image, graphics, design, commercial symbol, or other proprietary notation displayed on or through the Services.</li>
                        <li>Use cheats, automation software (bots), hacks, modifications (mods) or any other unauthorized third-party software designed to modify the Services.</li>
                        <li>Impersonate, or attempt to impersonate, somebody else using the Services without their authorization.</li>
                        <li>Access or use the Services in any manner that could disable, overburden, damage, disrupt or impair the Services or interfere with any other party’s access to or use of the Services.</li>
                        <li>Attempt to gain unauthorized access to, interfere with, damage or disrupt the Services, accounts registered to other users, or the computer systems or networks connected to the Services.</li>
                        <li>Circumvent, remove, alter, deactivate, degrade or thwart any technological measure or content protections of the Services.</li>
                        <li>Use any robot, spider, crawlers, scraper, or other automatic device, process, software or queries that intercepts, “mines,” scrapes, extracts, or otherwise accesses the Services to monitor, extract, copy or collect information or data from or through the Services, or engage in any manual process to do the same.</li>
                        <li>Introduce any viruses, trojan horses, worms, logic bombs or other materials that are malicious or technologically harmful into our systems.</li>
                        <li>Use any portion of the Services to build any products or services that are competitive to any portion of the Services.</li>
                        <li>Violate any applicable law or regulation in connection with your access to or use of the Services.</li>
                        <li>Access or use the Services in any way not expressly permitted by these Terms.</li>
                        <li>Use or distribute User Output in a misleading way, including, without limitation, representing that the User Output is entirely human generated. Further, if you distribute your User Output to others, to the extent required by applicable law, you must proactively disclose that such User Output was created using artificial intelligence technologies so as not to mislead others of its origin.</li>
                    </ul>

                    <h3>3. License to Your Content</h3>
                    <p>As part of your use of the Services, you may be able to input, post, upload and submit information (“User Input”) to the Services, and you may direct the Services to generate and output new content based on your User Input (“User Output”). {serviceName} reserves the right to prevent or remove certain User Inputs or User Outputs in its sole discretion, for example, if they violate these Terms. As between {serviceName} and you, you own all rights in your User Input or User Output. User Outputs are not considered part of the Services. As between us and you, to the extent we acquire any rights in any User Output, we hereby assign to you all right, title and interest in and to such User Output. Your User Input, User Output, and any other information, materials, or content you post, upload, submit, or make available through the Services are collectively referred to herein as “Your Content.” You are responsible for Your Content. You acknowledge that, due to the nature of the Services and generative artificial intelligence, User Output may not be unique and other third party users may generate similar content from their independent use of the Services.</p>
                    <p>{serviceName} does not claim to own any of Your Content and by using the Services and uploading or generating Your Content, you grant us a license to access, use, host, cache, store, reproduce, transmit, display, publish, distribute, and modify Your Content to operate, improve, promote and provide the Services and to develop new services and products, including to train or otherwise improve or modify our artificial intelligence and machine learning models. You agree that these rights and licenses are royalty-free, transferable, sublicensable, worldwide and irrevocable. This Section shall survive termination of these Terms.</p>

                    <h3>4. Term and Termination</h3>
                    <p>These Terms take effect when you first access the Services and remain in effect until terminated. You may terminate these Terms at any time by discontinuing the use of the Services and deleting your account, if any, via your account settings. We may terminate or suspend your use of the Services immediately and without notice for any reason, including if you violate the Terms. Upon {serviceName}’s termination of the Terms or termination of your use of the Services for any reason, {serviceName} may, but is not obligated to, delete any of Your Content.</p>

                    <h3>5. Subscription Services; Payment</h3>
                    <p>To access and use certain Services, you may be required to enroll in a subscription payment plan and pay certain recurring charges. Your Recurring Subscription will automatically renew until you cancel it in accordance herewith or your Recurring Subscription is otherwise terminated. You authorize us to store your payment method information and to automatically charge your payment method(s). You may cancel your Recurring Subscription through your account at any time, but if you cancel your Recurring Subscription before the end of the current subscription period, we will not refund any charges already paid to us. Following any cancellation, however, you will continue to have access to the applicable Services through the end of your current subscription period.</p>
                    
                    <h3>6. Exclusions and Limitations</h3>
                    <p>The services are provided "as is." except to the extent prohibited by law, we and our representatives make no warranties (express, implied, statutory or otherwise) with respect to the services, and disclaim all warranties including, without limitation, to warranties of merchantability, fitness for a particular purpose, satisfactory quality, non-infringement, and quiet enjoyment, and any warranties arising out of any course of dealing or trade usage. we do not warrant that the services will be uninterrupted, accurate or error-free, or that any content will be secure or not lost or altered.</p>
                    <p>We and our Representatives will not be liable for any indirect, incidental, special, consequential, or exemplary damages. Our aggregate liability under these Terms shall not exceed the greater of the amount you paid for the service that gave rise to the claim during the 12 months before the liability arose or one hundred dollars ($100).</p>
                    <p>{serviceName} takes no responsibility and assumes no liability for any content that you, another user, or a third party creates, uploads, posts, sends, receives, or stores on or through our services. It is your responsibility to evaluate whether User Outputs are appropriate for your use case. You acknowledge that factual assertions in User Outputs should not be relied upon without independently checking their accuracy, as they may be false, incomplete, or misleading.</p>

                    <h3>7. Workspace Content and Platform Neutrality</h3>
                    <p>Gymind serves strictly as the technological infrastructure and hosting provider. We do not create, verify, endorse, or control the educational content, AI persona configurations, advice, or assignments provided within the app.</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Content Responsibility:</strong> All courses, materials, and specific AI behavior instructions are created and managed solely by the <strong>Workspace</strong>. The Workspace is solely responsible for the accuracy, legality, and safety of their content.</li>
                        <li><strong>No Liability:</strong> Gymind is not liable for any misinformation, harmful advice, or offensive material resulting from an Workspace's configuration of the AI or their course content. Any reliance on such content is at your own risk.</li>
                        <li><strong>Disputes & Reporting:</strong> Any disputes regarding course material, grading, or specific AI interactions should be directed to the administrator of your specific Workspace or Workspace. However, if you believe any content hosted on our platform is harmful, illegal, or violates copyright laws, please send a detailed report to <a href="mailto:support@gymind.app" className="text-blue-600 hover:underline">support@gymind.app</a> so we may investigate in accordance with our policies.</li>
                    </ul>

                    <h3>8. Third-Party Material in the Services</h3>
                    <p>We do not monitor or review the content of third parties’ websites or services that are linked to or accessible from the Services. Opinions expressed or material appearing on such websites or services are not necessarily shared or endorsed by us. You acknowledge and agree that {serviceName} is not responsible for examining or evaluating the content, accuracy, completeness, availability, timeliness, validity, copyright compliance, legality, decency, quality or any other aspect of third parties’ websites or services.</p>

                    <h3>9. Our Intellectual Property</h3>
                    <p>The Services contain intellectual property owned by {serviceName} and/or our Representatives, including, without limitation, trademarks, copyrights, proprietary information, and other intellectual property. You are prohibited from modifying, publishing, transmitting, participating in the transfer or sale of, creating derivative works from, distributing, displaying, reproducing or performing, or in any way exploiting in any format whatsoever any of the Services or intellectual property, in whole or in part without our prior written consent.</p>

                    <h3>10. Copyright Complaints</h3>
                    <p>If you believe that your intellectual property rights have been infringed by a user of the Services, please send notice to our agent at <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a> with "Copyright Complaint" in the subject line. Written claims concerning copyright infringement must include: the physical or electronic signature of the copyright owner or an authorized agent; the identification of the copyrighted work claimed to have been infringed; identification of the infringing material; contact information for the copyright owner or authorized agent; a statement that you have a good faith belief that use of the material is not authorized; and a statement that the information in the notice is accurate, and under penalty of perjury, that you are authorized to act on behalf of the copyright owner.</p>

                    <h3>11. Indemnification</h3>
                    <p>You shall indemnify and hold us and our Representatives harmless from and against any and all losses, damages, settlements, liabilities, costs, charges, assessments, and expenses, as well as third-party claims and causes of action, including, without limitation, attorneys' fees, arising out of any breach by you of any of these Terms, violation of applicable law, or any use by you of the Services or Outputs thereof.</p>

                    <h3>12. Dispute Resolution</h3>
                    <p>You and {serviceName} agree that you will resolve any past or present claims relating to these Terms or our Services through final and binding arbitration, other than claims brought in small claims court or claims solely for injunctive relief or intellectual property disputes. Before initiating a formal action, you agree to try to resolve the dispute informally by sending {serviceName} notification containing your name, a description of the dispute, and the relief you seek. Any arbitration proceeding and all records pertaining to it will be confidential.</p>
                    
                    <h3>13. Notification of Changes</h3>
                    <p>We may modify the Terms from time to time in which case we will update the "Effective" date at the top of the Terms. Your continued access or use of the Services after the modifications have become effective will be deemed your acceptance of the modified Terms.</p>
                </div>
            </section>

            <section id="privacy" className="pt-8 border-t border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('legal.legal.privacyTitle')}</h2>
                <p className="text-sm text-gray-500 mb-6">Effective as of {effectiveDatePrivacy}</p>
                
                <div className="prose prose-sm text-gray-600 space-y-4 max-w-none">
                    <h3>1. Introduction</h3>
                    <p>{serviceName} is a platform for learning and applying knowledge. We respect and value the privacy of everyone who visits our websites and uses our platform. This Policy describes how {companyName} (“{serviceName}”, “our”, “we”, “us”) collects, uses and discloses personal information about you when you use our websites, application programming interfaces, software, tools, data and documentation (collectively, “Services”).</p>
                    <p>For inquiries, please contact us at <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>.</p>

                    <h3>2. Scope – What Does This Policy Cover?</h3>
                    <p>This Privacy Policy applies only to our collection and processing of information about users of the Services. This Privacy Policy does not extend to any websites or platforms operated by third parties that are linked to our Site. We are not responsible for the privacy or security of, or information found on these sites or platforms.</p>

                    <h3>3. What Information Do We Collect?</h3>
                    <p>We collect certain information about you from different sources, as described in this section.</p>
                    <p><strong>Information You Provide Us:</strong></p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Account and contact information:</strong> When you create an account, we collect your name, email address and account password. We may also collect other information associated with your account, such as your phone number, business/company name and position.</li>
                        <li><strong>User Input:</strong> When you use our Services, we collect personal information that is included in the text, voice, scripts, images, videos, and other Input that you provide to generate output. We may use the input that you provide us to improve our services, for example, to train and enhance the models that power our Services.</li>
                        <li><strong>Information posted to the Services:</strong> We collect information that you choose to share or make available.</li>
                        <li><strong>Communications information:</strong> We collect your name, email address, and other information you provide in communications with us.</li>
                    </ul>
                    <p><strong>Information Collected Automatically:</strong> We automatically collect certain information about your interaction with the Services (“Usage Data”), including through cookies and other technologies. This information includes device information, location information, and other information regarding your interaction with the Services.</p>

                    <h3>4. How Do We Use Your Information?</h3>
                    <p>We use your personal information to provide you with the best possible products and services. We process your Personal Data based on a valid legal ground. {serviceName} acts as a data processor when processing personal data on behalf of our business customers in accordance with their instructions. However, {serviceName} acts as a data controller when processing personal data for purposes such as marketing, service improvement, and regulatory compliance.</p>
                    <p>Purposes for processing include:</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>Providing and managing your Account and access to and use of our Services.</li>
                        <li>Personalizing and tailoring your experience with our Services.</li>
                        <li>Providing customer support and responding to communications from you.</li>
                        <li>To train and enhance the models that power our products and services. You may request to opt-out of this training and enhancement by contacting us at <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>.</li>
                        <li>Understanding the usage of our services, understanding trends and preferences, and improving our services.</li>
                        <li>Enhancing the safety and security of our Services.</li>
                        <li>Complying with applicable legal obligations and enforcing our contractual arrangements.</li>
                        <li>Sending you marketing communications (with your permission or where otherwise permitted by applicable law).</li>
                    </ul>

                    <h3>5. How Do We Share Your Data?</h3>
                    <p>We only disclose your personal information as described in this Privacy Policy. We will never sell your personal information. In certain circumstances, we may disclose your personal information to third parties, including:</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Vendors and Service Providers:</strong> We may contract with third parties who help us provide the Services, including for payment processing, cloud storage, AI processing, system administration, security, and marketing.</li>
                        <li><strong>With direction or consent:</strong> We may also disclose information to third parties when you request, direct or consent to us doing so.</li>
                        <li><strong>Affiliates:</strong> We may disclose information to our affiliates or others within our corporate group.</li>
                        <li><strong>Legal reasons:</strong> In certain circumstances, we may be legally required to share certain data held by us, which may include your personal information, for example, where we are involved in legal proceedings or where we are cooperating with law enforcement.</li>
                    </ul>

                    <h3>6. Cookies and Other Tracking Technologies</h3>
                    <p>The Services may use certain Tracking Technologies to collect Usage Data. We use Tracking Technologies because it is in our legitimate interests to facilitate, improve and tailor your experience with the Services. Most browsers accept cookies automatically, but you may be able to control the way in which your devices permit the use of Tracking Technologies by disabling or deleting them in your browser settings.</p>

                    <h3>7. How Long Do We Store Your Information?</h3>
                    <p>We only keep your personal information for as long as we need to provide our products and services as described in this Privacy Policy and/or for as long as we have your permission to keep it. If you submit a request to delete your information, we strive to take steps to delete that information within 72 hours of your request, unless we are required or permitted to retain such information under applicable law.</p>

                    <h3>8. How Do We Secure Your Information?</h3>
                    <p>Data security is of great importance to us, and to protect your personal information, we have put in place suitable physical, electronic, and managerial procedures designed to safeguard and secure personal information. Notwithstanding any security measures that we take, it is important to remember that the transmission of data via the Internet may not be completely secure, and we cannot guarantee that the collection, transmission and storage of data will always be secure.</p>
                    
                    <h3>9. Summary of Your Rights</h3>
                    <p>Depending on where you live, you may have certain rights in relation to your personal information, such as the right to Access, Delete, Correct, or Object to the processing of your data. To exercise these rights, please contact us at <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>.</p>

                    <h3>10. Children's Privacy</h3>
                    <p>Our Services are not intended for minors under the age of 18, and we do not knowingly collect personal information from children under 13. If you are a parent or guardian of a child under 13 years old who has provided us with personal information, please contact us.</p>
                    
                    <h3>11. Contacting Us</h3>
                    <p>If you have any questions about our Services or this Privacy Policy, please email us at <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>.</p>
                </div>
            </section>
        </>
    );
};

export default LegalContent;
