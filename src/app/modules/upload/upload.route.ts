import { uploadServices } from "./upload.service";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import multer from "multer";
import ApiError from "../../../errors/ApiErrors";
import express from "express";
import auth from "../../middlewares/auth";
import { fileUploader } from "../../../helpers/fileUploadHelper";
import { uploadController } from "./upload.controller";
import { uploadOne } from "../../../helpers/uploadService";

const router = express.Router();
const postImage=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024},fileFilter:(_req,file,cb)=>{if(file.mimetype!=="image/jpeg") return cb(new ApiError(400,"Choose a JPEG image."));cb(null,true);}});
router.post("/post-image",auth(),postImage.single("file"),catchAsync(async(req,res)=>{
 if(!req.file) throw new ApiError(400,"No file provided");
 const result=await uploadOne(req.file,{folder:"social-posts",direct:true});
 if(!result.url.startsWith("https://")) throw new ApiError(503,"Image sharing is unavailable. Please contact support to enable uploads.");
 sendResponse(res,{statusCode:201,success:true,message:"Image uploaded",data:result});
}));

// YouTube videos: MP4 up to 100 MB (Cloudinary free-plan video limit), stored on Cloudinary before responding.
const postVideo=multer({storage:multer.memoryStorage(),limits:{fileSize:100*1024*1024},fileFilter:(_req,file,cb)=>{if(file.mimetype!=="video/mp4") return cb(new ApiError(400,"Choose an MP4 video."));cb(null,true);}});
router.post("/post-video",auth(),postVideo.single("file"),catchAsync(async(req,res)=>{
 if(!req.file) throw new ApiError(400,"No file provided");
 const result=await uploadOne(req.file,{folder:"social-videos",direct:true});
 if(!result.url.startsWith("https://")) throw new ApiError(503,"Video sharing is unavailable. Please contact support to enable uploads.");
 sendResponse(res,{statusCode:201,success:true,message:"Video uploaded",data:result});
}));

// Inbox attachments: photos/GIFs up to 8 MB, MP4 video, MP3 audio and PDF up to 25 MB (Meta's limits).
const inboxTypes:Record<string,{type:string;max:number}>={"image/jpeg":{type:"image",max:8},"image/png":{type:"image",max:8},"image/gif":{type:"image",max:8},"video/mp4":{type:"video",max:25},"audio/mpeg":{type:"audio",max:25},"application/pdf":{type:"file",max:25}};
const inboxFile=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024},fileFilter:(_req,file,cb)=>{if(!inboxTypes[file.mimetype]) return cb(new ApiError(400,"Choose a photo (JPEG, PNG, GIF), MP4 video, MP3 audio or PDF."));cb(null,true);}});
router.post("/inbox-attachment",auth(),inboxFile.single("file"),catchAsync(async(req,res)=>{
 if(!req.file) throw new ApiError(400,"No file provided");
 const kind=inboxTypes[req.file.mimetype];
 if(req.file.size>kind.max*1024*1024) throw new ApiError(400,`This file is too large. The limit is ${kind.max} MB.`);
 const result=await uploadOne(req.file,{folder:"inbox-attachments",direct:true});
 if(!result.url.startsWith("https://res.cloudinary.com/")) throw new ApiError(503,"File sharing is unavailable. Please contact support to enable uploads.");
 sendResponse(res,{statusCode:201,success:true,message:"File uploaded",data:{type:kind.type,url:result.url,name:req.file.originalname.slice(0,200)}});
}));

router.post(
  "/single",
  auth(),
  fileUploader.uploadFile,
  uploadController.uploadSingle
);

router.post(
  "/multiple",
  auth(),
  fileUploader.uploadFiles,
  uploadController.uploadMultiple
);

export const uploadRoutes = router;
