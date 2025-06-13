import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, query } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// --- Firebase Configuration & Initialization ---
// These global variables are provided by the Canvas environment.
// DO NOT MODIFY THEM.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [storage, setStorage] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [packages, setPackages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');

  // Form states for new package upload
  const [packageName, setPackageName] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [packageVersion, setPackageVersion] = useState('');
  const [packageFile, setPackageFile] = useState(null);

  // Initialize Firebase and set up authentication
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);
      const firebaseStorage = getStorage(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);
      setStorage(firebaseStorage);

      // Authenticate with custom token if provided, otherwise sign in anonymously
      const signInUser = async () => {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(firebaseAuth, initialAuthToken);
          } else {
            await signInAnonymously(firebaseAuth);
          }
        } catch (error) {
          console.error("Firebase authentication failed:", error);
          setUploadMessage(`Auth error: ${error.message}`);
        }
      };

      // Listen for auth state changes
      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          setUserId(crypto.randomUUID()); // Fallback for unauthenticated users if anonymous fails
        }
        setIsAuthReady(true); // Auth state is ready, regardless of user presence
      });

      signInUser(); // Attempt sign-in on component mount

      return () => unsubscribeAuth(); // Cleanup auth listener
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
      setUploadMessage(`Firebase init error: ${error.message}`);
    }
  }, []); // Run only once on component mount

  // Fetch packages from Firestore when auth is ready
  useEffect(() => {
    if (db && isAuthReady) {
      // Define the collection path for public data
      // This collection path should be publicly readable for SPM to access without auth
      const packagesColRef = collection(db, `artifacts/${appId}/public/data/packages`);
      const q = query(packagesColRef); // No orderBy to avoid index issues

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedPackages = [];
        snapshot.forEach((doc) => {
          fetchedPackages.push({ id: doc.id, ...doc.data() });
        });
        setPackages(fetchedPackages);
      }, (error) => {
        console.error("Error fetching packages:", error);
        setUploadMessage(`Failed to load packages: ${error.message}`);
      });

      return () => unsubscribe(); // Cleanup listener on unmount
    }
  }, [db, isAuthReady, appId]); // Re-run when db or auth state changes

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setPackageFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!packageFile || !packageName || !packageDescription || !packageVersion || !auth || !userId) {
      setUploadMessage('Please fill all fields and select a file.');
      return;
    }

    setUploading(true);
    setUploadMessage('Starting upload...');
    setUploadProgress(0);

    const file = packageFile;
    // Sanitize package name for file system compatibility and consistent naming
    const sanitizedPackageName = packageName.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    const fileExtension = file.name.split('.').pop();
    const fileName = `${sanitizedPackageName}_v${packageVersion}.${fileExtension}`; // Consistent filename pattern

    const storageRef = ref(storage, `artifacts/${appId}/packages/${fileName}`); // Store in app-specific public storage
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
        setUploadMessage(`Upload is ${progress.toFixed(0)}% done`);
      },
      (error) => {
        console.error("Upload failed:", error);
        setUploadMessage(`Upload failed: ${error.message}`);
        setUploading(false);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadMessage('Upload successful. Saving package info...');

          // Add package metadata to Firestore
          const packagesColRef = collection(db, `artifacts/${appId}/public/data/packages`);
          await addDoc(packagesColRef, {
            name: packageName.toLowerCase(), // Store lowercase name for consistent SPM lookups
            displayName: packageName, // Original case for display
            description: packageDescription,
            version: packageVersion,
            fileName: fileName, // Use the generated consistent filename
            fileUrl: downloadURL,
            uploaderId: userId, // Store the uploader's user ID
            uploadTime: serverTimestamp(),
          });

          setUploadMessage('Package saved successfully! Your SPM program can now fetch it.');
          // Clear form after successful upload
          setPackageName('');
          setPackageDescription('');
          setPackageVersion('');
          setPackageFile(null);
          if (document.getElementById('packageFile')) {
            document.getElementById('packageFile').value = '';
          }
        } catch (error) {
          console.error("Error saving package info:", error);
          setUploadMessage(`Failed to save package info: ${error.message}`);
        } finally {
          setUploading(false);
          setUploadProgress(0);
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6 flex flex-col items-center font-sans text-gray-800">
      <script src="https://cdn.tailwindcss.com"></script>
      {/* Configure Tailwind to use Inter font */}
      <style>{`
        body { font-family: 'Inter', sans-serif; }
      `}</style>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />

      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-4xl mb-8 border border-blue-200">
        <h1 className="text-4xl font-extrabold text-center text-blue-800 mb-6 drop-shadow-sm">
          ShellOS Package Repository
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Share and discover Python programs for ShellOS. Your current user ID: <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded-md">{userId || 'Loading...'}</span>
        </p>

        {/* Upload New Package Section */}
        <div className="mb-10 p-6 bg-blue-50 rounded-lg border border-blue-200 shadow-inner">
          <h2 className="text-2xl font-bold text-blue-700 mb-4">Upload New Package</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label htmlFor="packageName" className="block text-sm font-medium text-gray-700 mb-1">Package Name (e.g., MyCoolApp)</label>
              <input
                type="text"
                id="packageName"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
                placeholder="e.g., MyCoolApp"
                disabled={!isAuthReady || uploading}
                required
              />
            </div>
            <div>
              <label htmlFor="packageDescription" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                id="packageDescription"
                value={packageDescription}
                onChange={(e) => setPackageDescription(e.target.value)}
                rows="3"
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
                placeholder="A brief description of your package..."
                disabled={!isAuthReady || uploading}
                required
              ></textarea>
            </div>
            <div>
              <label htmlFor="packageVersion" className="block text-sm font-medium text-gray-700 mb-1">Version (e.g., 1.0.0)</label>
              <input
                type="text"
                id="packageVersion"
                value={packageVersion}
                onChange={(e) => setPackageVersion(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
                placeholder="e.g., 1.0.0"
                disabled={!isAuthReady || uploading}
                required
              />
            </div>
            <div>
              <label htmlFor="packageFile" className="block text-sm font-medium text-gray-700 mb-1">Package File (.zip or .py)</label>
              <input
                type="file"
                id="packageFile"
                onChange={handleFileChange}
                accept=".zip,.py"
                className="mt-1 block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                disabled={!isAuthReady || uploading}
                required
              />
            </div>

            <button
              type="submit"
              className={`w-full py-3 px-6 rounded-lg text-white font-semibold transition duration-300 ease-in-out transform hover:scale-105
                ${uploading || !isAuthReady ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'}`}
              disabled={uploading || !isAuthReady}
            >
              {uploading ? `Uploading... ${uploadProgress.toFixed(0)}%` : 'Upload Package'}
            </button>
            {uploadMessage && (
              <p className="mt-2 text-center text-sm text-blue-600">{uploadMessage}</p>
            )}
            {uploading && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                </div>
            )}
          </form>
        </div>

        {/* Available Packages Section */}
        <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-md">
          <h2 className="text-2xl font-bold text-blue-700 mb-4">Available Packages</h2>
          {packages.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No packages available yet. Be the first to upload one!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {packages.map((pkg) => (
                <div key={pkg.id} className="bg-white p-5 rounded-lg shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-200">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{pkg.displayName} <span className="text-sm text-gray-500 font-normal">v{pkg.version}</span></h3>
                  <p className="text-gray-700 text-sm mb-3 line-clamp-3">{pkg.description}</p>
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
                    <span>Uploaded by: {pkg.uploaderId ? pkg.uploaderId.substring(0, 8) + '...' : 'N/A'}</span>
                    <span>{pkg.uploadTime?.toDate ? pkg.uploadTime.toDate().toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <a
                    href={pkg.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-full shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out"
                  >
                    Download <svg className="ml-2 -mr-1 w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L10 11.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>
            Your `SPM` program should fetch its package list from a dynamically generated `index.json`.
            To enable this, deploy a Firebase Cloud Function (HTTP triggered) that reads from this Firebase project's Firestore.
          </p>
          <p>
            Example `SPM` `INDEX_URL` (replace with your Cloud Function's deployed URL):
            <br />
            <code className="bg-gray-100 text-blue-700 p-1 rounded">https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/getPackageIndex</code>
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
